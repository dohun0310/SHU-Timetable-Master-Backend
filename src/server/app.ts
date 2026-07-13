import cors from "cors";
import express, { type Express } from "express";

import { SearchCourses } from "../application/use-cases/search-courses.js";
import type { CourseCatalog } from "../domain/schemas/catalog-schema.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { createCoursesRouter } from "./routes/courses.js";
import { createHealthRouter } from "./routes/health.js";
import { createMetaRouter } from "./routes/meta.js";

export interface CreateAppOptions {
  catalog: CourseCatalog;
  corsOrigin: string;
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", "strong");
  app.use(cors({ origin: options.corsOrigin === "*" ? "*" : options.corsOrigin }));

  app.use("/api/courses", createCoursesRouter(new SearchCourses(options.catalog)));
  app.use("/api/meta", createMetaRouter(options.catalog));
  app.use("/api/health", createHealthRouter(options.catalog));

  app.use(notFoundHandler());
  app.use(errorHandler());

  return app;
}
