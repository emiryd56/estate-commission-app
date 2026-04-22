import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'agent@example.com',
    maxLength: 120,
    format: 'email',
  })
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @ApiProperty({ example: 'Secret123', minLength: 6, maxLength: 128 })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}
