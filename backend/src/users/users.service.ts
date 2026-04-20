import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { User, UserDocument } from './schemas/user.schema';

const MONGO_DUPLICATE_KEY_CODE = 11000;

interface MongoWriteError {
  code?: number;
  keyValue?: Record<string, unknown>;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(dto: CreateUserDto): Promise<UserDocument> {
    try {
      const created = await this.userModel.create(dto);
      const reloaded = await this.userModel.findById(created._id).exec();

      if (!reloaded) {
        throw new InternalServerErrorException(
          'User was created but could not be reloaded',
        );
      }

      return reloaded;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(`Email "${dto.email}" is already in use`);
      }
      throw error;
    }
  }

  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  private isDuplicateKeyError(error: unknown): error is MongoWriteError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as MongoWriteError).code === MONGO_DUPLICATE_KEY_CODE
    );
  }
}
