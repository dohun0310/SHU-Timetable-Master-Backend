import type { ErrorRequestHandler, RequestHandler } from "express";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function notFoundHandler(): RequestHandler {
  return (_request, response) => {
    response.status(404).json({ error: { message: "존재하지 않는 경로입니다." } });
  };
}

export function errorHandler(): ErrorRequestHandler {
  return (error, _request, response, next) => {
    // 응답이 이미 나가기 시작했다면 Express 기본 핸들러가 연결을 정리해야 한다.
    if (response.headersSent) {
      next(error);
      return;
    }

    if (error instanceof HttpError) {
      response.status(error.status).json({
        error: { message: error.message, ...(error.details ? { details: error.details } : {}) },
      });
      return;
    }

    console.error(error);
    response.status(500).json({ error: { message: "서버 오류가 발생했습니다." } });
  };
}
