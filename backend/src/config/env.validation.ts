import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';

export type NodeEnv = 'development' | 'production' | 'test';

function toBoolean({ value }: { value: unknown }): unknown {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  }
  return value;
}

/**
 * Shape of the environment expected by the backend. Declared with class-validator
 * so that misconfiguration fails fast at startup instead of surfacing on the
 * first request that needs the variable (JWT_SECRET being the classic offender).
 */
class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV?: NodeEnv;

  @IsString()
  @IsNotEmpty({
    message: 'MONGODB_URI must be set (MongoDB Atlas connection string)',
  })
  MONGODB_URI!: string;

  @IsString()
  @IsNotEmpty({ message: 'JWT_SECRET must be set to a long random string' })
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  PORT?: number;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_TTL_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  ENABLE_SWAGGER?: boolean;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    forbidUnknownValues: false,
  });

  if (errors.length > 0) {
    const formatted = errors
      .map((error) => {
        const constraints = error.constraints
          ? Object.values(error.constraints).join('; ')
          : 'invalid value';
        return `  - ${error.property}: ${constraints}`;
      })
      .join('\n');
    throw new Error(
      `Invalid environment configuration:\n${formatted}\n\n` +
        'Check your .env file (see backend/.env.example for the expected shape).',
    );
  }

  // Extra production-only hardening: reject short JWT secrets before we even
  // start accepting login requests. In development we only warn so local
  // tinkering with a short secret still works.
  if (validated.JWT_SECRET.length < 32) {
    const warning =
      'JWT_SECRET is shorter than 32 characters. Use a long random string (see backend/.env.example).';
    if (validated.NODE_ENV === 'production') {
      throw new Error(`Invalid environment configuration:\n  - ${warning}`);
    }
    // eslint-disable-next-line no-console
    console.warn(`[env] Warning: ${warning}`);
  }

  return validated;
}
