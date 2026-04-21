import { Types } from 'mongoose';
import {
  AGENCY_SHARE_RATIO,
  calculateCommission,
} from './commission-calculator';

describe('calculateCommission', () => {
  const listingAgentId = new Types.ObjectId();
  const sellingAgentId = new Types.ObjectId();

  describe('Scenario 1: same listing and selling agent', () => {
    it('gives the full agent pool to the single agent', () => {
      const totalFee = 100_000;

      const result = calculateCommission(
        totalFee,
        listingAgentId,
        listingAgentId,
      );

      expect(result.companyCut).toBe(50_000);
      expect(result.listingAgentCut).toBe(50_000);
      expect(result.sellingAgentCut).toBe(0);
      expect(
        result.companyCut + result.listingAgentCut + result.sellingAgentCut,
      ).toBe(totalFee);
    });

    it('works when both parameters are different ObjectId instances with the same value', () => {
      const sharedId = new Types.ObjectId();
      const sameIdCopy = new Types.ObjectId(sharedId.toHexString());

      const result = calculateCommission(200_000, sharedId, sameIdCopy);

      expect(result.listingAgentCut).toBe(100_000);
      expect(result.sellingAgentCut).toBe(0);
    });
  });

  describe('Scenario 2: different listing and selling agents', () => {
    it('splits the agent pool equally (25% / 25%)', () => {
      const totalFee = 100_000;

      const result = calculateCommission(
        totalFee,
        listingAgentId,
        sellingAgentId,
      );

      expect(result.companyCut).toBe(50_000);
      expect(result.listingAgentCut).toBe(25_000);
      expect(result.sellingAgentCut).toBe(25_000);
      expect(
        result.companyCut + result.listingAgentCut + result.sellingAgentCut,
      ).toBe(totalFee);
    });

    it('honors the configured agency share ratio', () => {
      const totalFee = 80_000;

      const result = calculateCommission(
        totalFee,
        listingAgentId,
        sellingAgentId,
      );

      expect(result.companyCut).toBe(totalFee * AGENCY_SHARE_RATIO);
    });
  });

  describe('Scenario 3: edge cases', () => {
    it('returns all zeros when totalFee is 0', () => {
      const result = calculateCommission(0, listingAgentId, sellingAgentId);

      expect(result.companyCut).toBe(0);
      expect(result.listingAgentCut).toBe(0);
      expect(result.sellingAgentCut).toBe(0);
    });

    it('returns all zeros when totalFee is 0 and agents are the same', () => {
      const result = calculateCommission(0, listingAgentId, listingAgentId);

      expect(result.companyCut).toBe(0);
      expect(result.listingAgentCut).toBe(0);
      expect(result.sellingAgentCut).toBe(0);
    });

    it('throws when totalFee is negative', () => {
      expect(() =>
        calculateCommission(-1, listingAgentId, sellingAgentId),
      ).toThrow('totalFee must be a non-negative finite number');
    });

    it('throws when totalFee is NaN', () => {
      expect(() =>
        calculateCommission(Number.NaN, listingAgentId, sellingAgentId),
      ).toThrow('totalFee must be a non-negative finite number');
    });

    it('does not produce floating-point artefacts on odd numbers', () => {
      const totalFee = 100_001;
      const result = calculateCommission(totalFee, listingAgentId, sellingAgentId);

      expect(
        result.companyCut + result.listingAgentCut + result.sellingAgentCut,
      ).toBeCloseTo(totalFee, 10);
    });
  });
});
