import { Router } from "express";

import type { SearchCourses } from "../../application/use-cases/search-courses.js";
import type { Course } from "../../domain/schemas/catalog-schema.js";
import {
  UnschedulableCourseError,
  type TimetableBasket,
  type TimetableGenerator,
} from "../../domain/services/timetable-generator.js";
import { noCache } from "../http/cache.js";
import { formatIssues } from "../http/course-query-schema.js";
import { HttpError } from "../http/errors.js";
import {
  generateTimetablesSchema,
  type GenerateTimetablesRequest,
} from "../http/timetable-request-schema.js";

function resolveBaskets(
  request: GenerateTimetablesRequest,
  search: SearchCourses,
): TimetableBasket[] {
  const missing: string[] = [];

  const baskets = request.baskets.map((basket) => {
    const courses = basket.courseIds.flatMap((courseId): Course[] => {
      const course = search.findById(courseId);
      if (!course) {
        missing.push(courseId);
        return [];
      }
      return [course];
    });

    return { label: basket.label, required: basket.required, courses };
  });

  if (missing.length > 0) {
    throw new HttpError(400, `강좌를 찾을 수 없습니다: ${missing.join(", ")}`);
  }

  return baskets;
}

export function createTimetablesRouter(
  search: SearchCourses,
  generator: TimetableGenerator,
): Router {
  const router = Router();

  router.post("/generate", (request, response) => {
    const parsed = generateTimetablesSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new HttpError(400, "잘못된 시간표 생성 요청입니다.", formatIssues(parsed.error));
    }

    const baskets = resolveBaskets(parsed.data, search);
    const { credits, ...rest } = parsed.data.constraints ?? {};

    try {
      const result = generator.generate({
        baskets,
        constraints: { ...rest, minCredits: credits?.min, maxCredits: credits?.max },
        limit: parsed.data.limit,
      });

      noCache(response);
      response.json(result);
    } catch (error) {
      if (error instanceof UnschedulableCourseError) {
        throw new HttpError(
          400,
          error.message,
          error.courses.map((course) => ({ id: course.id, name: course.name })),
        );
      }
      throw error;
    }
  });

  return router;
}
