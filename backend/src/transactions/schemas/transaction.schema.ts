import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { TransactionStage } from '../enums/transaction-stage.enum';
import {
  FinancialBreakdown,
  FinancialBreakdownSchema,
} from './financial-breakdown.schema';

export type TransactionDocument = HydratedDocument<Transaction>;

@Schema({ timestamps: true, versionKey: false })
export class Transaction {
  @Prop({ type: String, required: true, trim: true })
  title!: string;

  @Prop({
    type: String,
    enum: Object.values(TransactionStage),
    default: TransactionStage.AGREEMENT,
    required: true,
    index: true,
  })
  stage!: TransactionStage;

  @Prop({ type: Number, required: true, min: 0 })
  totalFee!: number;

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  listingAgent!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  sellingAgent!: Types.ObjectId;

  @Prop({ type: FinancialBreakdownSchema, required: false })
  financialBreakdown?: FinancialBreakdown;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
