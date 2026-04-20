import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false, versionKey: false })
export class FinancialBreakdown {
  @Prop({ type: Number, required: false, min: 0 })
  companyCut?: number;

  @Prop({ type: Number, required: false, min: 0 })
  listingAgentCut?: number;

  @Prop({ type: Number, required: false, min: 0 })
  sellingAgentCut?: number;
}

export const FinancialBreakdownSchema =
  SchemaFactory.createForClass(FinancialBreakdown);
