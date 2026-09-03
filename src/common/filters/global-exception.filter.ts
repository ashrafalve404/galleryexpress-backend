import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let errors: unknown[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res['message'] as string) || exception.message;
        code = (res['code'] as string) || this.getCodeFromStatus(status);
        if (Array.isArray(res['message'])) {
          errors = res['message'] as unknown[];
          message = (errors as string[]).join(' | ');
          code = 'VALIDATION_ERROR';
          // Debug: log incoming body for validation failures
          try {
            const body = request.body;
            console.error('[ValidationError] errors:', errors);
            console.error('[ValidationError] request body:', JSON.stringify(body));
          } catch { /* noop */ }
        }
      } else {
        message = String(exceptionResponse);
        code = this.getCodeFromStatus(status);
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const handled = this.handlePrismaError(exception);
      status = handled.status;
      message = handled.message;
      code = handled.code;
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled error: ${exception.message}`,
        exception.stack,
      );
    }

    // Never expose stack traces
    const responseBody: Record<string, unknown> = {
      success: false,
      statusCode: status,
      code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (errors) {
      responseBody['errors'] = errors;
    }

    response.status(status).json(responseBody);
  }

  private handlePrismaError(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
    code: string;
  } {
    switch (error.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: 'A record with this value already exists',
          code: 'DUPLICATE_ENTRY',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          code: 'NOT_FOUND',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Related record not found',
          code: 'FOREIGN_KEY_VIOLATION',
        };
      default:
        this.logger.error(`Prisma error ${error.code}:`, error.message);
        return {
          status: HttpStatus.BAD_REQUEST,
          message: error.message || 'Database operation failed',
          code: 'DATABASE_ERROR',
        };
    }
  }

  private getCodeFromStatus(status: number): string {
    const statusMap: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_ERROR',
    };
    return statusMap[status] || 'ERROR';
  }
}
