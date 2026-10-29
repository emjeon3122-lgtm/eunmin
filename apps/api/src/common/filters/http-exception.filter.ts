import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface ErrorBody {
  code: string;
  message: string;
}

// Maps every thrown error (HttpException subclasses, ApiException, or unknown) into
// the { error: { code, message } } envelope from doc 02 section 1.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      body = this.normalize(res, status);
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error('Unknown exception thrown', String(exception));
    }

    response.status(status).json({ error: body });
  }

  private normalize(res: unknown, status: number): ErrorBody {
    if (typeof res === 'object' && res !== null) {
      const anyRes = res as Record<string, unknown>;
      // ApiException already ships { code, message }.
      if (typeof anyRes.code === 'string' && typeof anyRes.message === 'string') {
        return { code: anyRes.code, message: anyRes.message };
      }
      // Default Nest HttpException shape: { statusCode, message, error }.
      const message = anyRes.message;
      const text = Array.isArray(message) ? message.join(', ') : (message as string) ?? String(res);
      return { code: this.codeForStatus(status), message: text };
    }
    return { code: this.codeForStatus(status), message: String(res) };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
