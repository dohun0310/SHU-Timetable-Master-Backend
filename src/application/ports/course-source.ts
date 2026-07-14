import type { CourseCategory } from "../../domain/schemas/catalog-schema.js";

export interface RawCourse {
  category: CourseCategory;
  tab: string;
  lectureType: string;
  passFail: boolean;
  courseCode: string;
  // 한 강좌를 여러 교수가 가르치고 여러 전공에 걸칠 수 있다. 주관학과는 언제나 하나다.
  professors: string[];
  majorNames: string[];
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
