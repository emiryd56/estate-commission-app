import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '../enums/user-role.enum';

export type UserDocument = HydratedDocument<User>;

const BCRYPT_SALT_ROUNDS = 10;

@Schema({ timestamps: true, versionKey: false })
export class User {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email!: string;

  @Prop({ type: String, required: true, select: false })
  password!: string;

  @Prop({
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.AGENT,
    required: true,
  })
  role!: UserRole;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.pre<UserDocument>('save', async function hashPasswordHook(): Promise<void> {
  if (!this.isModified('password')) {
    return;
  }

  const salt: string = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
  this.password = await bcrypt.hash(this.password, salt);
});
