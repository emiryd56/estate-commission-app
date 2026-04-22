import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

interface RequestWithUser extends Request {
  user?: { email?: string } & Record<string, unknown>;
}

/**
 * Thin HTTP access log. Logs one line per response:
 *   METHOD /path -> 200 (12ms) user=agent@example.com
 *
 * Kept deliberately minimal (no body/headers) so no sensitive data leaks into
 * structured logs. Uses NestJS's own Logger so output goes through the same
 * pipeline as the rest of the application.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: RequestWithUser, res: Response, next: NextFunction): void {
    const started = process.hrtime.bigint();
    const { method, originalUrl } = req;

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      const actor = req.user?.email ? ` user=${req.user.email}` : '';
      const line = `${method} ${originalUrl} -> ${res.statusCode} (${durationMs.toFixed(1)}ms)${actor}`;

      if (res.statusCode >= 500) {
        this.logger.error(line);
      } else if (res.statusCode >= 400) {
        this.logger.warn(line);
      } else {
        this.logger.log(line);
      }
    });

    next();
  }
}
