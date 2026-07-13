import { z } from "zod";

import { courseSorts, type CourseQuery } from "../../application/use-cases/search-courses.js";
import { courseCategorySchema, weekdaySchema } from "../../domain/schemas/catalog-schema.js";

// 같은 필터를 "?day=MONDAY&day=TUESDAY" 로도, "?day=MONDAY,TUESDAY" 로도 보낼 수 있게 한다.
function multiValue<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess((value) => {
    if (value === undefined) return undefined;
    const entries = (Array.isArray(value) ? value : [value])
      .flatMap((entry) => String(entry).split(","))
      .map((entry) => entry.trim())
      .filter(Boolean);
    return entries.length > 0 ? entries : undefined;
  }, z.array(schema).optional());
}

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시각은 HH:MM 형식이어야 합니다.");

export const courseQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  category: multiValue(courseCategorySchema),
  department: multiValue(z.string().min(1)),
  major: multiValue(z.string().min(1)),
  professor: multiValue(z.string().min(1)),
  day: multiValue(weekdaySchema),
  startAfter: timeSchema.optional(),
  endBefore: timeSchema.optional(),
  minCredits: z.coerce.number().nonnegative().optional(),
  maxCredits: z.coerce.number().nonnegative().optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(courseSorts).default("name"),
});

export function toCourseQuery(input: z.infer<typeof courseQuerySchema>): CourseQuery {
  return {
    keyword: input.q,
    categories: input.category,
    departmentIds: input.department,
    majorIds: input.major,
    professors: input.professor,
    days: input.day,
    startAfter: input.startAfter,
    endBefore: input.endBefore,
    minCredits: input.minCredits,
    maxCredits: input.maxCredits,
    page: input.page,
    size: input.size,
    sort: input.sort,
  };
}

export function formatIssues(error: z.ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "query",
    message: issue.message,
  }));
}
