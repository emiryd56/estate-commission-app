import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionStageDto } from './dto/update-transaction-stage.dto';
import { TransactionStage } from './enums/transaction-stage.enum';
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
    const created = await this.transactionModel.create({
      title: dto.title,
      totalFee: dto.totalFee,
      listingAgent: new Types.ObjectId(dto.listingAgent),
      sellingAgent: new Types.ObjectId(dto.sellingAgent),
    });

    return created;
  }

  async findAll(): Promise<TransactionDocument[]> {
    return this.transactionModel
      .find()
      .populate('listingAgent', AGENT_POPULATE_FIELDS)
      .populate('sellingAgent', AGENT_POPULATE_FIELDS)
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<TransactionDocument> {
    this.assertValidObjectId(id);

    const transaction = await this.transactionModel
      .findById(id)
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
  ): Promise<TransactionDocument> {
    this.assertValidObjectId(id);

    const transaction = await this.transactionModel.findById(id).exec();
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

  private assertValidObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`"${id}" is not a valid ObjectId`);
    }
  }
}
