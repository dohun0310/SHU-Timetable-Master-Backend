import { Router } from "express";

import type { CourseCatalog } from "../../domain/schemas/catalog-schema.js";
import { publicCache } from "../http/cache.js";

export function createMetaRouter(catalog: CourseCatalog): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    publicCache(response);
    response.json({ meta: catalog.meta, filters: catalog.filters });
  });

  return router;
}
