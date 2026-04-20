import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

type MongoFilter = Record<string, unknown>;
import { UserRole } from '../users/enums/user-role.enum';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { UpdateTransactionStageDto } from './dto/update-transaction-stage.dto';
import { TransactionStage } from './enums/transaction-stage.enum';
import { PaginatedResult } from './interfaces/paginated-result.interface';
import {
  Transaction,
  TransactionDocument,
} from './schemas/transaction.schema';
import { calculateCommission } from './utils/commission-calculator';
import { canTransition } from './utils/stage-transitions';

const AGENT_POPULATE_FIELDS = 'name email' as const;

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  async create(dto: CreateTransactionDto): Promise<TransactionDocument> {
    return this.transactionModel.create({
      title: dto.title,
      totalFee: dto.totalFee,
      listingAgent: new Types.ObjectId(dto.listingAgent),
      sellingAgent: new Types.ObjectId(dto.sellingAgent),
    });
  }

  async findAllPaginated(
    query: PaginationQueryDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedResult<TransactionDocument>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const filter = this.buildAccessFilter(user);

    const [data, total] = await Promise.all([
      this.transactionModel
        .find(filter)
        .populate('listingAgent', AGENT_POPULATE_FIELDS)
        .populate('sellingAgent', AGENT_POPULATE_FIELDS)
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
      .exec();

    if (!transaction) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    return transaction;
  }

  async updateStage(
    id: string,
    dto: UpdateTransactionStageDto,
    user: AuthenticatedUser,
  ): Promise<TransactionDocument> {
    this.assertValidObjectId(id);

    const filter: MongoFilter = {
      _id: new Types.ObjectId(id),
      ...this.buildAccessFilter(user),
    };

    const transaction = await this.transactionModel.findOne(filter).exec();
    if (!transaction) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    const nextStage = dto.stage;
    if (transaction.stage === nextStage) {
      throw new BadRequestException(
        `Transaction is already in stage "${nextStage}"`,
      );
    }

    if (!canTransition(transaction.stage, nextStage)) {
      throw new BadRequestException(
        `Invalid stage transition from "${transaction.stage}" to "${nextStage}"`,
      );
    }

    transaction.stage = nextStage;

    if (nextStage === TransactionStage.COMPLETED) {
      transaction.financialBreakdown = calculateCommission(
        transaction.totalFee,
        transaction.listingAgent,
        transaction.sellingAgent,
      );
    }

    await transaction.save();
    return transaction.populate([
      { path: 'listingAgent', select: AGENT_POPULATE_FIELDS },
      { path: 'sellingAgent', select: AGENT_POPULATE_FIELDS },
    ]);
  }

  private buildAccessFilter(user: AuthenticatedUser): MongoFilter {
    if (user.role === UserRole.ADMIN) {
      return {};
    }

    const userObjectId = new Types.ObjectId(user.userId);
    return {
      $or: [
        { listingAgent: userObjectId },
        { sellingAgent: userObjectId },
      ],
    };
  }

  private assertValidObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`"${id}" is not a valid ObjectId`);
    }
  }
}
