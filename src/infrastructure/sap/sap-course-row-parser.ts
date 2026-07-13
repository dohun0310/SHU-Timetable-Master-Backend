import type { RawCourse } from "../../application/ports/course-source.js";
import type { CourseCategory } from "../../domain/schemas/catalog-schema.js";

export interface SapCourseRowContext {
  tab: string;
  category: CourseCategory;
}

// 수집기가 셀을 canonicalHeaders 순서로 정렬해 넘긴다.
// 주관학과와 전공은 이름이 비슷해 뒤바꾸기 쉽다. 이 표가 유일한 기준이다.
const columns = {
  lectureType: 0, // 강의유형
  courseCode: 1, // 과목번호
  professor: 2, // 담당교수
  classTime: 3, // 강의시간
  departmentName: 4, // 주관학과
  requirement: 5, // 이수구분
  passFail: 6, // PF/PN여부
  majorName: 7, // 전공
  capacity: 8, // 정원
  classNumber: 9, // 분반
  creditHours: 14, // 학점/이론/실습
  courseName: 15, // 과목명
} as const;

function text(cells: string[], index: number): string {
  return (cells[index] ?? "").replace(/\u00a0/g, " ").trim();
}

// SAP은 한 셀에 값을 여러 줄로 담는다. 교수 두 명, 전공 두 개가 한 칸에 들어온다.
// 같은 값이 반복되기도 하므로 중복을 지우고 남은 값을 모두 지킨다.
function joinDistinctLines(value: string): string {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return [...new Set(lines)].join(", ");
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
    const courseCode = text(cells, columns.courseCode);
    if (courseCode.length === 0) {
      throw new Error("SAP 강좌 행에 과목코드가 없습니다.");
    }

    const professor = joinDistinctLines(text(cells, columns.professor));
    const departmentName = joinDistinctLines(text(cells, columns.departmentName));
    const majorName = joinDistinctLines(text(cells, columns.majorName));
    const creditHours = parseCreditHours(text(cells, columns.creditHours));

    return {
      category: context.category,
      tab: context.tab,
      lectureType: text(cells, columns.lectureType),
      passFail: text(cells, columns.passFail).length > 0,
      courseCode,
      professor: professor.length > 0 ? professor : null,
      departmentName: departmentName.length > 0 ? departmentName : null,
      majorName: majorName.length > 0 ? majorName : null,
      // 강의시간은 줄 구분을 그대로 지킨다. 한 줄이 한 교시다.
      classTime: text(cells, columns.classTime),
      requirement: text(cells, columns.requirement),
      courseName: text(cells, columns.courseName),
      capacity: nullableNumber(cells, columns.capacity),
      classNumber: text(cells, columns.classNumber),
      ...creditHours,
      hours: creditHours.theoryHours + creditHours.practiceHours,
    };
  }
}
