import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../users/enums/user-role.enum';
import { TransactionStage } from './enums/transaction-stage.enum';
import { Transaction } from './schemas/transaction.schema';
import { TransactionsService } from './transactions.service';

interface MockExecChain<T> {
  populate: jest.Mock;
  select: jest.Mock;
  lean: jest.Mock;
  sort: jest.Mock;
  skip: jest.Mock;
  limit: jest.Mock;
  exec: jest.Mock<Promise<T>>;
}

function chain<T>(resolved: T): MockExecChain<T> {
  const mock: MockExecChain<T> = {
    populate: jest.fn(),
    select: jest.fn(),
    lean: jest.fn(),
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    exec: jest.fn().mockResolvedValue(resolved),
  };
  mock.populate.mockReturnValue(mock);
  mock.select.mockReturnValue(mock);
  mock.lean.mockReturnValue(mock);
  mock.sort.mockReturnValue(mock);
  mock.skip.mockReturnValue(mock);
  mock.limit.mockReturnValue(mock);
  return mock;
}

describe('TransactionsService', () => {
  let service: TransactionsService;
  let model: {
    create: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    aggregate: jest.Mock;
  };

  const admin: AuthenticatedUser = {
    userId: new Types.ObjectId().toHexString(),
    name: 'Admin',
    email: 'admin@firma.com',
    role: UserRole.ADMIN,
  };
  const agentA: AuthenticatedUser = {
    userId: new Types.ObjectId().toHexString(),
    name: 'Agent A',
    email: 'agentA@firma.com',
    role: UserRole.AGENT,
  };
  const otherAgentId = new Types.ObjectId().toHexString();

  let aggregate: jest.Mock;

  beforeEach(async () => {
    aggregate = jest.fn();
    model = {
      create: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      aggregate,
    } as typeof model & { aggregate: jest.Mock };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: getModelToken(Transaction.name), useValue: model },
      ],
    }).compile();

    service = moduleRef.get(TransactionsService);
  });

  describe('create', () => {
    const baseDto = {
      title: 'Test işlemi',
      totalFee: 100_000,
      listingAgent: agentA.userId,
      sellingAgent: otherAgentId,
    };

    it('inserts a transaction with an initial AGREEMENT stage history entry', async () => {
      model.create.mockResolvedValue({ _id: new Types.ObjectId(), ...baseDto });

      await service.create(baseDto, admin);

      expect(model.create).toHaveBeenCalledTimes(1);
      const payload = model.create.mock.calls[0][0];
      expect(payload.stageHistory).toHaveLength(1);
      expect(payload.stageHistory[0].stage).toBe(TransactionStage.AGREEMENT);
      expect(payload.stageHistory[0].changedBy.toString()).toBe(admin.userId);
    });

    it('forbids agents from creating transactions where they are not involved', async () => {
      const dto = {
        ...baseDto,
        listingAgent: otherAgentId,
        sellingAgent: new Types.ObjectId().toHexString(),
      };

      await expect(service.create(dto, agentA)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(model.create).not.toHaveBeenCalled();
    });

    it('allows agents that list themselves as the listing agent', async () => {
      model.create.mockResolvedValue({ _id: new Types.ObjectId(), ...baseDto });

      await expect(service.create(baseDto, agentA)).resolves.toBeDefined();
    });

    it('allows agents that list themselves as the selling agent', async () => {
      const dto = {
        ...baseDto,
        listingAgent: otherAgentId,
        sellingAgent: agentA.userId,
      };
      model.create.mockResolvedValue({ _id: new Types.ObjectId(), ...dto });

      await expect(service.create(dto, agentA)).resolves.toBeDefined();
    });

    it('allows agents that appear on both sides (same agent)', async () => {
      const dto = {
        ...baseDto,
        listingAgent: agentA.userId,
        sellingAgent: agentA.userId,
      };
      model.create.mockResolvedValue({ _id: new Types.ObjectId(), ...dto });

      await expect(service.create(dto, agentA)).resolves.toBeDefined();
    });
  });

  describe('findAllPaginated', () => {
    it('applies search filter as case-insensitive regex', async () => {
      model.find.mockReturnValue(chain([]));
      model.countDocuments.mockReturnValue(chain(0));

      await service.findAllPaginated(
        { page: 1, limit: 10, search: 'Ev' },
        admin,
      );

      const [filter] = model.find.mock.calls[0];
      expect(filter).toHaveProperty('title.$regex', 'Ev');
      expect(filter).toHaveProperty('title.$options', 'i');
    });

    it('applies stage filter when provided', async () => {
      model.find.mockReturnValue(chain([]));
      model.countDocuments.mockReturnValue(chain(0));

      await service.findAllPaginated(
        { page: 1, limit: 10, stage: TransactionStage.TITLE_DEED },
        admin,
      );

      const [filter] = model.find.mock.calls[0];
      expect(filter).toMatchObject({ stage: TransactionStage.TITLE_DEED });
    });
  });

  describe('updateStage', () => {
    const transactionId = new Types.ObjectId().toHexString();
    const listingAgent = new Types.ObjectId();
    const sellingAgent = new Types.ObjectId();

    it('throws NotFoundException when the transaction does not exist', async () => {
      model.findOne.mockReturnValue(chain(null));

      await expect(
        service.updateStage(
          transactionId,
          { stage: TransactionStage.EARNEST_MONEY },
          admin,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException for invalid forward transitions', async () => {
      model.findOne.mockReturnValue(
        chain({
          _id: new Types.ObjectId(transactionId),
          stage: TransactionStage.AGREEMENT,
          totalFee: 100_000,
          listingAgent,
          sellingAgent,
        }),
      );

      await expect(
        service.updateStage(
          transactionId,
          { stage: TransactionStage.COMPLETED },
          admin,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when already in the requested stage', async () => {
      model.findOne.mockReturnValue(
        chain({
          _id: new Types.ObjectId(transactionId),
          stage: TransactionStage.EARNEST_MONEY,
          totalFee: 100_000,
          listingAgent,
          sellingAgent,
        }),
      );

      await expect(
        service.updateStage(
          transactionId,
          { stage: TransactionStage.EARNEST_MONEY },
          admin,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('persists the next stage and stage history on a valid transition', async () => {
      model.findOne.mockReturnValue(
        chain({
          _id: new Types.ObjectId(transactionId),
          stage: TransactionStage.AGREEMENT,
          totalFee: 100_000,
          listingAgent,
          sellingAgent,
        }),
      );
      const updatedDoc = {
        _id: transactionId,
        stage: TransactionStage.EARNEST_MONEY,
      };
      model.findOneAndUpdate.mockReturnValue(chain(updatedDoc));

      const result = await service.updateStage(
        transactionId,
        { stage: TransactionStage.EARNEST_MONEY },
        admin,
      );

      expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const [filter, update] = model.findOneAndUpdate.mock.calls[0];
      expect(filter.stage).toBe(TransactionStage.AGREEMENT);
      expect(update.$set.stage).toBe(TransactionStage.EARNEST_MONEY);
      expect(update.$push.stageHistory.stage).toBe(
        TransactionStage.EARNEST_MONEY,
      );
      expect(update.$set).not.toHaveProperty('financialBreakdown');
      expect(result).toBe(updatedDoc);
    });

    it('computes financialBreakdown when transitioning to COMPLETED', async () => {
      model.findOne.mockReturnValue(
        chain({
          _id: new Types.ObjectId(transactionId),
          stage: TransactionStage.TITLE_DEED,
          totalFee: 100_000,
          listingAgent,
          sellingAgent,
        }),
      );
      model.findOneAndUpdate.mockReturnValue(chain({ _id: transactionId }));

      await service.updateStage(
        transactionId,
        { stage: TransactionStage.COMPLETED },
        admin,
      );

      const [, update] = model.findOneAndUpdate.mock.calls[0];
      expect(update.$set.financialBreakdown).toEqual({
        companyCut: 50_000,
        listingAgentCut: 25_000,
        sellingAgentCut: 25_000,
      });
    });

    it('throws ConflictException when another writer changed the stage first', async () => {
      model.findOne.mockReturnValue(
        chain({
          _id: new Types.ObjectId(transactionId),
          stage: TransactionStage.AGREEMENT,
          totalFee: 100_000,
          listingAgent,
          sellingAgent,
        }),
      );
      model.findOneAndUpdate.mockReturnValue(chain(null));

      await expect(
        service.updateStage(
          transactionId,
          { stage: TransactionStage.EARNEST_MONEY },
          admin,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findOne access control', () => {
    const transactionId = new Types.ObjectId().toHexString();

    it('applies an access filter for agents to prevent viewing foreign transactions', async () => {
      model.findOne.mockReturnValue(chain(null));

      await expect(
        service.findOne(transactionId, agentA),
      ).rejects.toBeInstanceOf(NotFoundException);

      const [filter] = model.findOne.mock.calls[0];
      expect(filter.$or).toBeDefined();
      expect(filter.$or).toHaveLength(2);
    });

    it('does not restrict admins via an access filter', async () => {
      model.findOne.mockReturnValue(
        chain({ _id: new Types.ObjectId(transactionId) }),
      );

      await service.findOne(transactionId, admin);

      const [filter] = model.findOne.mock.calls[0];
      expect(filter).not.toHaveProperty('$or');
    });
  });

  describe('getStats', () => {
    function mockAggregateSequence(
      results: Array<Record<string, unknown>[]>,
    ): void {
      let callIndex = 0;
      aggregate.mockImplementation(() => ({
        exec: jest
          .fn()
          .mockResolvedValue(
            results[Math.min(callIndex++, results.length - 1)],
          ),
      }));
    }

    it('builds a personal earnings summary for agents and omits topAgents', async () => {
      mockAggregateSequence([
        // stage breakdown
        [
          { _id: TransactionStage.AGREEMENT, count: 2, totalFee: 0 },
          { _id: TransactionStage.COMPLETED, count: 3, totalFee: 450_000 },
        ],
        // earnings
        [{ total: 37_500, thisMonth: 12_500 }],
      ]);
      model.find.mockReturnValue(chain([]));

      const result = await service.getStats(agentA);

      expect(result.breakdown.total).toBe(5);
      expect(result.breakdown.active).toBe(2);
      expect(result.breakdown.completed).toBe(3);
      expect(result.breakdown.completedFeeSum).toBe(450_000);
      expect(result.earnings).toEqual({
        total: 37_500,
        thisMonth: 12_500,
        scope: 'personal',
      });
      expect(result.topAgents).toEqual([]);

      // Agent-scoped pipelines must match through the $or access filter.
      const [firstCall] = aggregate.mock.calls[0] as [
        Array<{ $match?: unknown }>,
      ];
      expect(firstCall[0]).toHaveProperty('$match.$or');
    });

    it('returns company-scope earnings and topAgents for admins', async () => {
      mockAggregateSequence([
        [{ _id: TransactionStage.COMPLETED, count: 1, totalFee: 100_000 }],
        [{ total: 50_000, thisMonth: 50_000 }],
        [
          {
            agentId: 'abc',
            name: 'Ahmet',
            email: 'a@firma.com',
            completedCount: 1,
            totalCut: 25_000,
          },
        ],
      ]);
      model.find.mockReturnValue(chain([]));

      const result = await service.getStats(admin);

      expect(result.earnings.scope).toBe('company');
      expect(result.earnings.total).toBe(50_000);
      expect(result.topAgents).toHaveLength(1);
      expect(result.topAgents[0].name).toBe('Ahmet');

      // Admin stage breakdown must not be access-filtered.
      const [firstCall] = aggregate.mock.calls[0] as [
        Array<{ $match?: unknown }>,
      ];
      expect(firstCall[0]).toEqual({ $match: {} });
    });

    it('defaults earnings to zero when no completed transactions exist', async () => {
      mockAggregateSequence([[], [], []]);
      model.find.mockReturnValue(chain([]));

      const result = await service.getStats(admin);

      expect(result.earnings).toEqual({
        total: 0,
        thisMonth: 0,
        scope: 'company',
      });
      expect(result.breakdown.total).toBe(0);
    });
  });
});
