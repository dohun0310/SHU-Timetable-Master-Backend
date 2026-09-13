import type { Response } from "express";

// 카탈로그는 빌드 시점에 고정되므로 프록시와 브라우저가 안심하고 캐시할 수 있다.
export function publicCache(response: Response): void {
  response.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
}

export function noCache(response: Response): void {
  response.set("Cache-Control", "no-store");
}
