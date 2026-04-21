import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { UpdateTransactionStageDto } from './dto/update-transaction-stage.dto';
import { TransactionStage } from './enums/transaction-stage.enum';
import { PaginatedResult } from './interfaces/paginated-result.interface';
import { Transaction, TransactionDocument } from './schemas/transaction.schema';
import { calculateCommission } from './utils/commission-calculator';
import { canTransition } from './utils/stage-transitions';

type MongoFilter = Record<string, unknown>;

const AGENT_POPULATE_FIELDS = 'name email' as const;
const SEARCH_REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  async create(
    dto: CreateTransactionDto,
    user: AuthenticatedUser,
  ): Promise<TransactionDocument> {
    this.assertAgentInvolvement(dto, user);

    const created = await this.transactionModel.create({
      title: dto.title,
      totalFee: dto.totalFee,
      listingAgent: new Types.ObjectId(dto.listingAgent),
      sellingAgent: new Types.ObjectId(dto.sellingAgent),
      stageHistory: [
        {
          stage: TransactionStage.AGREEMENT,
          changedAt: new Date(),
          changedBy: new Types.ObjectId(user.userId),
        },
      ],
    });

    this.logger.log(
      `Transaction created: ${created._id.toString()} by ${user.email}`,
    );
    return created;
  }

  async findAllPaginated(
    query: PaginationQueryDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedResult<TransactionDocument>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const filter: MongoFilter = {
      ...this.buildAccessFilter(user),
      ...this.buildSearchFilter(query.search),
      ...this.buildStageFilter(query.stage),
      ...this.buildFeeFilter(query.minTotalFee, query.maxTotalFee),
      ...this.buildDateFilter(query.startDate, query.endDate),
      ...this.buildAgentFilter(query.agentId, user),
    };

    const [data, total] = await Promise.all([
      this.transactionModel
        .find(filter)
        .populate('listingAgent', AGENT_POPULATE_FIELDS)
        .populate('sellingAgent', AGENT_POPULATE_FIELDS)
        .populate('stageHistory.changedBy', AGENT_POPULATE_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.transactionModel.countDocuments(filter).exec(),
    ]);

    return {
      data,
      total,
      page,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async findOne(
    id: string,
    user: AuthenticatedUser,
  ): Promise<TransactionDocument> {
    this.assertValidObjectId(id);

    const filter: MongoFilter = {
      _id: new Types.ObjectId(id),
      ...this.buildAccessFilter(user),
    };

    const transaction = await this.transactionModel
      .findOne(filter)
      .populate('listingAgent', AGENT_POPULATE_FIELDS)
      .populate('sellingAgent', AGENT_POPULATE_FIELDS)
      .populate('stageHistory.changedBy', AGENT_POPULATE_FIELDS)
      .exec();

    if (!transaction) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    return transaction;
  }

  /**
   * Atomic stage transition using findOneAndUpdate with the current stage as a
   * precondition. Prevents race conditions when two clients try to advance the
   * same transaction concurrently: only the first update matches the current
   * stage filter; the loser gets a 409 Conflict.
   */
  async updateStage(
    id: string,
    dto: UpdateTransactionStageDto,
    user: AuthenticatedUser,
  ): Promise<TransactionDocument> {
    this.assertValidObjectId(id);

    const current = await this.transactionModel
      .findOne({
        _id: new Types.ObjectId(id),
        ...this.buildAccessFilter(user),
      })
      .select('stage totalFee listingAgent sellingAgent')
      .lean()
      .exec();

    if (!current) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    const nextStage = dto.stage;
    if (current.stage === nextStage) {
      throw new BadRequestException(
        `Transaction is already in stage "${nextStage}"`,
      );
    }

    if (!canTransition(current.stage, nextStage)) {
      throw new BadRequestException(
        `Invalid stage transition from "${current.stage}" to "${nextStage}"`,
      );
    }

    const update: Record<string, unknown> = {
      $set: { stage: nextStage },
      $push: {
        stageHistory: {
          stage: nextStage,
          changedAt: new Date(),
          changedBy: new Types.ObjectId(user.userId),
        },
      },
    };

    if (nextStage === TransactionStage.COMPLETED) {
      const breakdown = calculateCommission(
        current.totalFee,
        current.listingAgent,
        current.sellingAgent,
      );
      (update.$set as Record<string, unknown>).financialBreakdown = breakdown;
    }

    const updated = await this.transactionModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), stage: current.stage },
        update,
        { new: true },
      )
      .populate('listingAgent', AGENT_POPULATE_FIELDS)
      .populate('sellingAgent', AGENT_POPULATE_FIELDS)
      .populate('stageHistory.changedBy', AGENT_POPULATE_FIELDS)
      .exec();

    if (!updated) {
      throw new ConflictException(
        'Transaction stage changed concurrently. Please reload and try again.',
      );
    }

    this.logger.log(
      `Transaction ${id} advanced ${current.stage} -> ${nextStage} by ${user.email}`,
    );
    return updated;
  }

  private assertAgentInvolvement(
    dto: CreateTransactionDto,
    user: AuthenticatedUser,
  ): void {
    if (user.role === UserRole.ADMIN) {
      return;
    }
    const isInvolved =
      dto.listingAgent === user.userId || dto.sellingAgent === user.userId;
    if (!isInvolved) {
      throw new ForbiddenException(
        'Agents can only create transactions in which they are the listing or selling agent',
      );
    }
  }

  private buildAccessFilter(user: AuthenticatedUser): MongoFilter {
    if (user.role === UserRole.ADMIN) {
      return {};
    }

    const userObjectId = new Types.ObjectId(user.userId);
    return {
      $or: [{ listingAgent: userObjectId }, { sellingAgent: userObjectId }],
    };
  }

  private buildSearchFilter(search: string | undefined): MongoFilter {
    if (!search || search.trim().length === 0) {
      return {};
    }
    const escaped = search.trim().replace(SEARCH_REGEX_SPECIAL_CHARS, '\\$&');
    return { title: { $regex: escaped, $options: 'i' } };
  }

  private buildStageFilter(stage: TransactionStage | undefined): MongoFilter {
    return stage ? { stage } : {};
  }

  private buildFeeFilter(
    min: number | undefined,
    max: number | undefined,
  ): MongoFilter {
    const range: Record<string, number> = {};
    if (typeof min === 'number' && !Number.isNaN(min)) {
      range.$gte = min;
    }
    if (typeof max === 'number' && !Number.isNaN(max)) {
      range.$lte = max;
    }
    return Object.keys(range).length > 0 ? { totalFee: range } : {};
  }

  private buildDateFilter(
    startDate: string | undefined,
    endDate: string | undefined,
  ): MongoFilter {
    const range: Record<string, Date> = {};
    if (startDate) {
      const parsed = new Date(startDate);
      if (!Number.isNaN(parsed.getTime())) {
        range.$gte = parsed;
      }
    }
    if (endDate) {
      const parsed = new Date(endDate);
      if (!Number.isNaN(parsed.getTime())) {
        parsed.setHours(23, 59, 59, 999);
        range.$lte = parsed;
      }
    }
    return Object.keys(range).length > 0 ? { createdAt: range } : {};
  }

  private buildAgentFilter(
    agentId: string | undefined,
    user: AuthenticatedUser,
  ): MongoFilter {
    if (!agentId || user.role !== UserRole.ADMIN) {
      return {};
    }
    if (!Types.ObjectId.isValid(agentId)) {
      return {};
    }
    const oid = new Types.ObjectId(agentId);
    return {
      $or: [{ listingAgent: oid }, { sellingAgent: oid }],
    };
  }

  private assertValidObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`"${id}" is not a valid ObjectId`);
    }
  }
}
