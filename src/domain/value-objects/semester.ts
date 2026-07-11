import { z } from "zod";

export const semesters = ["FIRST", "SUMMER", "SECOND", "WINTER"] as const;

export const semesterSchema = z.enum(semesters);

export type Semester = z.infer<typeof semesterSchema>;

export const semesterLabels: Record<Semester, string> = {
  FIRST: "1학기",
  SUMMER: "하계 계절학기",
  SECOND: "2학기",
  WINTER: "동계 계절학기",
};

export const sapSemesterLabels: Record<Semester, string> = {
  FIRST: "1st Semester",
  SUMMER: "Summer",
  SECOND: "2nd Semester",
  WINTER: "Winter",
};

export function parseSemester(value: string): Semester {
  const result = semesterSchema.safeParse(value);

  if (!result.success) {
    throw new Error("TARGET_SEMESTER는 FIRST, SUMMER, SECOND, WINTER 중 하나여야 합니다.");
  }

  return result.data;
}
