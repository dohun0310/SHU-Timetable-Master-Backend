import type { CourseCategory } from "../../domain/schemas/catalog-schema.js";

export interface RawCourse {
  category: CourseCategory;
  tab: string;
  lectureType: string;
  passFail: boolean;
  courseCode: string;
  professor: string | null;
  majorName: string | null;
  classTime: string;
  requirement: string;
  courseName: string;
  departmentName: string | null;
  capacity: number | null;
  classNumber: string;
  credits: number;
  theoryHours: number;
  practiceHours: number;
  hours: number;
}

export interface CourseSource {
  collect(): Promise<RawCourse[]>;
}
