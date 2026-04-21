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
  };

  const admin: AuthenticatedUser = {
    userId: new Types.ObjectId().toHexString(),
    email: 'admin@firma.com',
    role: UserRole.ADMIN,
  };
  const agentA: AuthenticatedUser = {
    userId: new Types.ObjectId().toHexString(),
    email: 'agentA@firma.com',
    role: UserRole.AGENT,
  };
  const otherAgentId = new Types.ObjectId().toHexString();

  beforeEach(async () => {
    model = {
      create: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
    };

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
});
