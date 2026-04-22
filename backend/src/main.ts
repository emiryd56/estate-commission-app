import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw || raw.trim().length === 0) {
    return ['http://localhost:3000'];
  }
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/**
 * Swagger is exposed automatically outside of production. In production it
 * only boots when ENABLE_SWAGGER=true is set explicitly so that the public
 * internet-facing deployment does not advertise the full API surface by default.
 */
function shouldExposeSwagger(config: ConfigService): boolean {
  const override = config.get<boolean | string>('ENABLE_SWAGGER');
  if (typeof override === 'boolean') return override;
  if (typeof override === 'string') {
    return ['true', '1', 'yes', 'on'].includes(override.trim().toLowerCase());
  }
  return config.get<string>('NODE_ENV') !== 'production';
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet({ contentSecurityPolicy: false }));

  app.enableCors({
    origin: parseCorsOrigins(config.get<string>('CORS_ORIGIN')),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (shouldExposeSwagger(config)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Emlak Komisyon API')
      .setDescription(
        'Estate agency commission tracking API built with NestJS + MongoDB Atlas.',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log('Swagger UI mounted at /docs');
  }

  const port = config.get<number>('PORT') ?? 3001;
  await app.listen(port);
  logger.log(
    `Backend listening on port ${port} (${config.get<string>('NODE_ENV') ?? 'development'})`,
  );
}

void bootstrap();
