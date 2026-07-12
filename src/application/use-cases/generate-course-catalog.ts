import type { RawCourse } from "../ports/course-source.js";
import type {
  CatalogFilter,
  Course,
  CourseCatalog,
  CourseCategory,
} from "../../domain/schemas/catalog-schema.js";
import { catalogSchema } from "../../domain/schemas/catalog-schema.js";
import type { CourseIdGenerator } from "../../domain/services/course-id-generator.js";
import type { ScheduleParser } from "../../domain/services/schedule-parser.js";
import type { Semester } from "../../domain/value-objects/semester.js";

const categoryLabels: Record<CourseCategory, string> = {
  BASIC_LIBERAL_ARTS: "기초교양",
  CORE_LIBERAL_ARTS: "핵심교양",
  MICRO_DEGREE: "마이크로디그리",
  MAJOR: "학과/전공",
  TEACHING: "교직",
};

export interface GenerateCourseCatalogInput {
  academicYear: number;
  semester: Semester;
  sourceUrl: string;
  rawCourses: RawCourse[];
}

export interface GenerateCourseCatalogDependencies {
  idGenerator: CourseIdGenerator;
  scheduleParser: ScheduleParser;
  now?: () => Date;
}

function organization(name: string | null) {
  if (!name?.trim()) return null;
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return { id: normalized, name: name.trim() };
}

function createFilters(values: Array<{ id: string; label: string }>): CatalogFilter[] {
  const counts = new Map<string, CatalogFilter>();
  for (const value of values) {
    const current = counts.get(value.id);
    if (current) current.count += 1;
    else counts.set(value.id, { ...value, count: 1 });
  }
  return [...counts.values()].sort((left, right) => left.label.localeCompare(right.label, "ko"));
}

export class GenerateCourseCatalog {
  private readonly now: () => Date;

  constructor(private readonly dependencies: GenerateCourseCatalogDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  execute(input: GenerateCourseCatalogInput): CourseCatalog {
    const generatedAt = this.now().toISOString();
    const courses = input.rawCourses.map((raw): Course => {
      const department = organization(raw.departmentName);
      const major = organization(raw.majorName);
      return {
        id: this.dependencies.idGenerator.generate({
          academicYear: input.academicYear,
          semester: input.semester,
          courseCode: raw.courseCode,
          classNumber: raw.classNumber,
          departmentId: department?.id ?? null,
        }),
        academicYear: input.academicYear,
        semester: input.semester,
        category: raw.category,
        categoryLabel: categoryLabels[raw.category],
        department,
        major,
        courseCode: raw.courseCode,
        classNumber: raw.classNumber,
        name: raw.courseName,
        professor: raw.professor,
        credits: raw.credits,
        hours: raw.hours,
        schedule: this.dependencies.scheduleParser.parse(raw.classTime),
        source: { tab: raw.tab, collectedAt: generatedAt },
      };
    });

    return catalogSchema.parse({
      meta: {
        academicYear: input.academicYear,
        semester: input.semester,
        generatedAt,
        source: input.sourceUrl,
        courseCount: courses.length,
      },
      filters: {
        categories: createFilters(
          courses.map((course) => ({ id: course.category, label: course.categoryLabel })),
        ),
        departments: createFilters(
          courses.flatMap((course) =>
            course.department ? [{ id: course.department.id, label: course.department.name }] : [],
          ),
        ),
        majors: createFilters(
          courses.flatMap((course) =>
            course.major ? [{ id: course.major.id, label: course.major.name }] : [],
          ),
        ),
        professors: createFilters(
          courses.flatMap((course) =>
            course.professor ? [{ id: course.professor, label: course.professor }] : [],
          ),
        ),
        days: createFilters(
          courses.flatMap((course) =>
            course.schedule.meetings.map((meeting) => ({
              id: meeting.day,
              label: meeting.dayLabel,
            })),
          ),
        ),
      },
      courses,
    });
  }
}
