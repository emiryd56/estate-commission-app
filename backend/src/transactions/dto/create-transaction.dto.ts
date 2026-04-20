import {
  IsMongoId,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTransactionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  totalFee!: number;

  @IsMongoId()
  listingAgent!: string;

  @IsMongoId()
  sellingAgent!: string;
}
