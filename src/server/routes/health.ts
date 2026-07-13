import { Router } from "express";

import type { CourseCatalog } from "../../domain/schemas/catalog-schema.js";
import { noCache } from "../http/cache.js";

export function createHealthRouter(catalog: CourseCatalog): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    noCache(response);
    response.json({ status: "ok", courseCount: catalog.meta.courseCount });
  });

  return router;
}
