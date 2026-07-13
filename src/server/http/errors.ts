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

function clientErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status =
    (error as { status?: unknown; statusCode?: unknown }).status ??
    (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" && status >= 400 && status < 500 ? status : null;
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

    // 본문 파싱 실패처럼 Express 미들웨어가 만든 4xx는 클라이언트 잘못이므로 그대로 돌려준다.
    const status = clientErrorStatus(error);
    if (status) {
      response.status(status).json({ error: { message: "요청 본문을 읽을 수 없습니다." } });
      return;
    }

    console.error(error);
    response.status(500).json({ error: { message: "서버 오류가 발생했습니다." } });
  };
}
