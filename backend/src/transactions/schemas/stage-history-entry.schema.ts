import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { TransactionStage } from '../enums/transaction-stage.enum';

@Schema({ _id: false, versionKey: false })
export class StageHistoryEntry {
  @Prop({
    type: String,
    enum: Object.values(TransactionStage),
    required: true,
  })
  stage!: TransactionStage;

  @Prop({ type: Date, required: true, default: Date.now })
  changedAt!: Date;

  @Prop({ type: Types.ObjectId, ref: User.name, required: false })
  changedBy?: Types.ObjectId;
}

export const StageHistoryEntrySchema =
  SchemaFactory.createForClass(StageHistoryEntry);
