import { Router } from "express";

import type { CourseCatalog } from "../../domain/schemas/catalog-schema.js";
import { noCache } from "../http/cache.js";

export function createHealthRouter(catalog: CourseCatalog): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    noCache(response);
    const { courseCount } = catalog.meta;

    // 강좌가 하나도 없으면 프로세스는 정상이어도 검색과 시간표 생성 결과가 모두 비므로 서비스할 수 없다.
    if (courseCount === 0) {
      response.status(503).json({ status: "unavailable", courseCount });
      return;
    }

    response.json({ status: "ok", courseCount });
  });

  return router;
}
