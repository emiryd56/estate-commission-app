import { Types } from 'mongoose';
import { FinancialBreakdown } from '../schemas/financial-breakdown.schema';

export const AGENCY_SHARE_RATIO = 0.5;

export function calculateCommission(
  totalFee: number,
  listingAgentId: Types.ObjectId,
  sellingAgentId: Types.ObjectId,
): Required<FinancialBreakdown> {
  if (!Number.isFinite(totalFee) || totalFee < 0) {
    throw new Error('totalFee must be a non-negative finite number');
  }

  const companyCut = totalFee * AGENCY_SHARE_RATIO;
  const agentPool = totalFee - companyCut;
  const isSameAgent = listingAgentId.equals(sellingAgentId);

  if (isSameAgent) {
    return {
      companyCut,
      listingAgentCut: agentPool,
      sellingAgentCut: 0,
    };
  }

  const splitCut = agentPool / 2;
  return {
    companyCut,
    listingAgentCut: splitCut,
    sellingAgentCut: splitCut,
  };
}
