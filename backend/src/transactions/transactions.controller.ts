import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { UpdateTransactionStageDto } from './dto/update-transaction-stage.dto';
import type { PaginatedResult } from './interfaces/paginated-result.interface';
import { TransactionDocument } from './schemas/transaction.schema';
import { TransactionsService } from './transactions.service';
import { buildPdfFilename, buildTransactionPdf } from './utils/transaction-pdf';

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  create(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TransactionDocument> {
    return this.transactionsService.create(dto, user);
  }

  @Get()
  findAll(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResult<TransactionDocument>> {
    return this.transactionsService.findAllPaginated(query, user);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TransactionDocument> {
    return this.transactionsService.findOne(id, user);
  }

  @Patch(':id/stage')
  updateStage(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionStageDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TransactionDocument> {
    return this.transactionsService.updateStage(id, dto, user);
  }

  @Get(':id/export')
  async exportOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    const transaction = await this.transactionsService.findOne(id, user);
    const filename = buildPdfFilename(transaction);
    const buffer = await buildTransactionPdf(transaction);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
