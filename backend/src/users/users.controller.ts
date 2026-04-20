import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UserDocument } from './schemas/user.schema';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto): Promise<UserDocument> {
    return this.usersService.create(dto);
  }

  @Get()
  findAll(): Promise<UserDocument[]> {
    return this.usersService.findAll();
  }
}
