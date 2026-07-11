import type { RawCourse } from "../../application/ports/course-source.js";
import type { CourseCategory } from "../../domain/schemas/catalog-schema.js";

export interface SapCourseRowContext {
  tab: string;
  category: CourseCategory;
}

function text(cells: string[], index: number): string {
  return (cells[index] ?? "").replace(/\u00a0/g, " ").trim();
}

function nullableText(cells: string[], index: number): string | null {
  const value = text(cells, index);
  return value.length > 0 ? value : null;
}

function nullableNumber(cells: string[], index: number): number | null {
  const value = text(cells, index);
  if (value.length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCreditHours(value: string): {
  credits: number;
  theoryHours: number;
  practiceHours: number;
} {
  const [credits = "0", theory = "0", practice = "0"] = value.split("/");
  return {
    credits: Number(credits) || 0,
    theoryHours: Number(theory) || 0,
    practiceHours: Number(practice) || 0,
  };
}

export class SapCourseRowParser {
  parse(cells: string[], context: SapCourseRowContext): RawCourse {
    const courseCode = text(cells, 2);
    if (courseCode.length === 0) {
      throw new Error("SAP 강좌 행에 과목코드가 없습니다.");
    }

    const creditHours = parseCreditHours(text(cells, 15));

    return {
      category: context.category,
      tab: context.tab,
      lectureType: text(cells, 0),
      passFail: text(cells, 1).length > 0,
      courseCode,
      professor: nullableText(cells, 3),
      majorName: nullableText(cells, 4),
      classTime: text(cells, 5),
      requirement: text(cells, 6),
      courseName: text(cells, 7),
      departmentName: nullableText(cells, 8),
      capacity: nullableNumber(cells, 9),
      classNumber: text(cells, 10),
      ...creditHours,
      hours: creditHours.theoryHours + creditHours.practiceHours,
    };
  }
}
