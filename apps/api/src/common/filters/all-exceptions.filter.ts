import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { requestIdFrom } from '../request-context';

interface ErrorResponse {
  error: string;
  message: string | string[];
  path: string;
  requestId?: string;
  statusCode: number;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const httpResponse = isHttpException ? exception.getResponse() : undefined;

    if (!isHttpException) {
      this.logger.error(
        'Unhandled request error',
        exception instanceof Error ? exception.stack : '',
      );
    }

    const body = this.toErrorResponse(httpResponse, status, request.url, requestIdFrom(request));
    response.status(status).json(body);
  }

  private toErrorResponse(
    response: string | object | undefined,
    statusCode: number,
    path: string,
    requestId?: string,
  ): ErrorResponse {
    let message: string | string[] = 'Internal server error';
    let error = HttpStatus[statusCode] ?? 'Error';

    if (typeof response === 'string') {
      message = response;
    } else if (this.isHttpErrorBody(response)) {
      message = response.message;
      error = response.error ?? error;
    }

    return {
      error,
      message,
      path,
      requestId,
      statusCode,
      timestamp: new Date().toISOString(),
    };
  }

  private isHttpErrorBody(value: object | undefined): value is {
    error?: string;
    message: string | string[];
  } {
    return value !== undefined && 'message' in value;
  }
}
