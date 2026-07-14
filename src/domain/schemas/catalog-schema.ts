import { z } from "zod";

import { semesterSchema } from "../value-objects/semester.js";

export const courseCategories = [
  "BASIC_LIBERAL_ARTS",
  "CORE_LIBERAL_ARTS",
  "MICRO_DEGREE",
  "MAJOR",
  "TEACHING",
] as const;

export const courseCategorySchema = z.enum(courseCategories);

export const weekdaySchema = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

export const courseMeetingSchema = z
  .object({
    day: weekdaySchema,
    dayLabel: z.string().min(1),
    startPeriod: z.number().int().positive(),
    endPeriod: z.number().int().positive(),
    startTime: z.string().nullable(),
    endTime: z.string().nullable(),
    location: z.string().nullable(),
  })
  .refine((meeting) => meeting.startPeriod <= meeting.endPeriod, {
    message: "시작 교시는 종료 교시보다 클 수 없습니다.",
    path: ["endPeriod"],
  });

export const courseScheduleSchema = z.object({
  raw: z.string(),
  parseStatus: z.enum(["PARSED", "PARTIALLY_PARSED", "UNPARSED", "NO_SCHEDULE"]),
  meetings: z.array(courseMeetingSchema),
});

export const organizationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const courseSchema = z.object({
  id: z.string().min(1),
  academicYear: z.number().int().min(2000),
  semester: semesterSchema,
  category: courseCategorySchema,
  categoryLabel: z.string().min(1),
  department: organizationSchema.nullable(),
  // 한 강좌가 여러 전공에 걸치고 여러 교수가 가르칠 수 있다. 주관학과는 언제나 하나다.
  majors: z.array(organizationSchema),
  courseCode: z.string().min(1),
  classNumber: z.string().min(1),
  name: z.string().min(1),
  professors: z.array(z.string().min(1)),
  credits: z.number().nonnegative(),
  hours: z.number().nonnegative(),
  schedule: courseScheduleSchema,
  source: z.object({
    tab: z.string().min(1),
    collectedAt: z.iso.datetime(),
  }),
});

export const catalogFilterSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  count: z.number().int().nonnegative(),
});

export const catalogSchema = z
  .object({
    meta: z.object({
      academicYear: z.number().int().min(2000),
      semester: semesterSchema,
      generatedAt: z.iso.datetime(),
      source: z.url(),
      courseCount: z.number().int().nonnegative(),
    }),
    filters: z.object({
      categories: z.array(catalogFilterSchema),
      departments: z.array(catalogFilterSchema),
      majors: z.array(catalogFilterSchema),
      professors: z.array(catalogFilterSchema),
      days: z.array(catalogFilterSchema),
    }),
    courses: z.array(courseSchema),
  })
  .superRefine((catalog, context) => {
    const courseIds = new Set<string>();
    for (const [index, course] of catalog.courses.entries()) {
      if (courseIds.has(course.id)) {
        context.addIssue({
          code: "custom",
          message: "강좌 ID는 중복될 수 없습니다.",
          path: ["courses", index, "id"],
        });
      }
      courseIds.add(course.id);
    }

    if (catalog.meta.courseCount !== catalog.courses.length) {
      context.addIssue({
        code: "custom",
        message: "courseCount는 courses 배열 길이와 일치해야 합니다.",
        path: ["meta", "courseCount"],
      });
    }
  });

export type CourseCategory = z.infer<typeof courseCategorySchema>;
export type Course = z.infer<typeof courseSchema>;
export type CatalogFilter = z.infer<typeof catalogFilterSchema>;
export type CourseCatalog = z.infer<typeof catalogSchema>;
