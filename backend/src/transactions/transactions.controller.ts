import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionStageDto } from './dto/update-transaction-stage.dto';
import { TransactionDocument } from './schemas/transaction.schema';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  create(@Body() dto: CreateTransactionDto): Promise<TransactionDocument> {
    return this.transactionsService.create(dto);
  }

  @Get()
  findAll(): Promise<TransactionDocument[]> {
    return this.transactionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<TransactionDocument> {
    return this.transactionsService.findOne(id);
  }

  @Patch(':id/stage')
  updateStage(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionStageDto,
  ): Promise<TransactionDocument> {
    return this.transactionsService.updateStage(id, dto);
  }
}
