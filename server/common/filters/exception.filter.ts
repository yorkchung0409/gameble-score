import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { BusinessException } from '../interfaces/exception.interface';
import { HTTP_STATUS_TO_RESPONSE_CODE_MAP, ResponseCode } from '../constants/api_response_code';
import { ApiErrorResponse } from '../interfaces/api_response.interface';

// 全局异常过滤器，用于捕获所有未处理的异常
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
     
    // 如果响应头已发送，则不处理
    if (response.headersSent) {
      return;
    }

    let errorResponse: Omit<ApiErrorResponse, 'httpStatus'>;
    let httpStatus: HttpStatus;

    if (exception instanceof BusinessException) {
      // 业务异常
      httpStatus = exception.httpStatus;
      errorResponse = {
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
          fieldErrors: exception.fieldErrors,
          timestamp: Date.now(),
        },
      };
    } else if (exception instanceof HttpException) {
      // HTTP异常
      httpStatus = exception.getStatus() as HttpStatus;
      const exceptionResponse = exception.getResponse();

      errorResponse = {
        error: {
          code: HTTP_STATUS_TO_RESPONSE_CODE_MAP[httpStatus],
          message: typeof exceptionResponse === 'string' ? exceptionResponse : exception.message,
          details: typeof exceptionResponse === 'object' ? JSON.stringify(exceptionResponse) : undefined,
          timestamp: Date.now(),
        },
      };
    } else {
      // 未知异常（生产环境不向客户端泄露内部堆栈）
      httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
      const err = exception as Error;
      const errorBody: {
        code: string;
        message: string;
        timestamp: number;
        stack?: string;
        cause?: string;
      } = {
        code: ResponseCode.INTERNAL_ERROR,
        message: '服务器内部错误',
        timestamp: Date.now(),
      };
      if (process.env.NODE_ENV !== 'production') {
        errorBody.stack = err.stack;
        if (err.cause) errorBody.cause = String(err.cause);
      }
      errorResponse = {
        error: errorBody,
      };
    }

    response.status(httpStatus).json(errorResponse);
  }
}
