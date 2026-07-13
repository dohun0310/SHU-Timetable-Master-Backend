import { Router } from "express";

import type { SearchCourses } from "../../application/use-cases/search-courses.js";
import { courseQuerySchema, formatIssues, toCourseQuery } from "../http/course-query-schema.js";
import { HttpError } from "../http/errors.js";
import { publicCache } from "../http/cache.js";

export function createCoursesRouter(search: SearchCourses): Router {
  const router = Router();

  router.get("/", (request, response) => {
    const parsed = courseQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new HttpError(400, "잘못된 검색 조건입니다.", formatIssues(parsed.error));
    }

    publicCache(response);
    response.json(search.execute(toCourseQuery(parsed.data)));
  });

  router.get("/:id", (request, response) => {
    const course = search.findById(request.params.id);
    if (!course) {
      throw new HttpError(404, `강좌를 찾을 수 없습니다: ${request.params.id}`);
    }

    publicCache(response);
    response.json(course);
  });

  return router;
}
