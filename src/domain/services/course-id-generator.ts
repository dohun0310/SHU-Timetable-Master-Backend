import type { Semester } from "../value-objects/semester.js";

export interface CourseIdentitySource {
  academicYear: number;
  semester: Semester;
  courseCode: string;
  classNumber: string;
  departmentId: string | null;
}

export interface CourseIdGenerator {
  generate(source: CourseIdentitySource): string;
}

function normalizeIdPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export class DefaultCourseIdGenerator implements CourseIdGenerator {
  generate(source: CourseIdentitySource): string {
    const parts = [
      String(source.academicYear),
      source.semester,
      source.courseCode,
      source.classNumber,
      source.departmentId,
    ];

    return parts
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .map(normalizeIdPart)
      .join("-");
  }
}
