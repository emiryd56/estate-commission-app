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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
import type { TransactionStats } from './interfaces/transaction-stats.interface';
import { TransactionDocument } from './schemas/transaction.schema';
import { TransactionsService } from './transactions.service';
import { buildPdfFilename, buildTransactionPdf } from './utils/transaction-pdf';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new transaction' })
  @ApiResponse({ status: 201, description: 'Transaction created.' })
  @ApiResponse({
    status: 403,
    description:
      'Agent attempted to create a transaction they are not part of.',
  })
  create(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TransactionDocument> {
    return this.transactionsService.create(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'List transactions (paginated)',
    description:
      'Admins see all transactions. Agents see only transactions where they are the listing or selling agent.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of transactions.' })
  findAll(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResult<TransactionDocument>> {
    return this.transactionsService.findAllPaginated(query, user);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard aggregates (scoped to the caller)' })
  @ApiResponse({
    status: 200,
    description: 'Breakdown, earnings, recent lists and top agents.',
  })
  getStats(@CurrentUser() user: AuthenticatedUser): Promise<TransactionStats> {
    return this.transactionsService.getStats(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a transaction by id' })
  @ApiParam({ name: 'id', description: 'Transaction ObjectId' })
  @ApiResponse({
    status: 200,
    description: 'Transaction document with populated agents.',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  @ApiResponse({
    status: 403,
    description: "Agent cannot access another agent's transaction.",
  })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TransactionDocument> {
    return this.transactionsService.findOne(id, user);
  }

  @Patch(':id/stage')
  @ApiOperation({
    summary: 'Advance a transaction to the next stage',
    description:
      'Only the direct next stage is allowed. Moving into COMPLETED triggers commission breakdown calculation.',
  })
  @ApiParam({ name: 'id', description: 'Transaction ObjectId' })
  @ApiResponse({ status: 200, description: 'Transaction updated.' })
  @ApiResponse({ status: 400, description: 'Invalid stage transition.' })
  @ApiResponse({
    status: 409,
    description: 'Concurrent stage change detected.',
  })
  updateStage(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionStageDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TransactionDocument> {
    return this.transactionsService.updateStage(id, dto, user);
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Export a transaction summary as PDF' })
  @ApiParam({ name: 'id', description: 'Transaction ObjectId' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'Binary PDF stream.' })
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
