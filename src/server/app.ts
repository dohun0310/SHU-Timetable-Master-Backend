import cors from "cors";
import express, { type Express } from "express";

import type { CourseCatalog } from "../domain/schemas/catalog-schema.js";

export interface CreateAppOptions {
  catalog: CourseCatalog;
  corsOrigin: string;
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", "strong");
  app.use(cors({ origin: options.corsOrigin === "*" ? "*" : options.corsOrigin }));

  const serveCatalog = (_request: express.Request, response: express.Response) => {
    response.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    response.json(options.catalog);
  };

  app.get("/api/catalog", serveCatalog);
  app.get("/catalog.json", serveCatalog);
  app.get("/api/health", (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json({ status: "ok", courseCount: options.catalog.meta.courseCount });
  });

  return app;
}
