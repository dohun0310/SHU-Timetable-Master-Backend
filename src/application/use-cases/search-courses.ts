import type { Course, CourseCatalog, CourseCategory } from "../../domain/schemas/catalog-schema.js";
import type { Weekday } from "../../domain/value-objects/course-schedule.js";

export const courseSorts = ["name", "credits"] as const;

export type CourseSort = (typeof courseSorts)[number];

// 값이 없다는 것은 그 조건으로 거르지 않는다는 뜻이므로 undefined를 명시적으로 허용한다.
export interface CourseQuery {
  keyword?: string | undefined;
  categories?: CourseCategory[] | undefined;
  departmentIds?: string[] | undefined;
  majorIds?: string[] | undefined;
  professors?: string[] | undefined;
  days?: Weekday[] | undefined;
  startAfter?: string | undefined;
  endBefore?: string | undefined;
  minCredits?: number | undefined;
  maxCredits?: number | undefined;
  page: number;
  size: number;
  sort: CourseSort;
}

export interface CourseSearchResult {
  page: number;
  size: number;
  total: number;
  totalPages: number;
  courses: Course[];
}

// "  John Kim " 과 "johnkim" 이 같은 강좌를 찾도록 공백과 대소문자를 지운다.
function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

function matchesKeyword(course: Course, keyword: string): boolean {
  const haystack = normalize(`${course.name}${course.courseCode}${course.professor ?? ""}`);
  return haystack.includes(normalize(keyword));
}

function includedIn(values: string[] | undefined, candidate: string | null): boolean {
  if (!values || values.length === 0) return true;
  return candidate !== null && values.includes(candidate);
}

export class SearchCourses {
  private readonly coursesById: Map<string, Course>;

  constructor(private readonly catalog: CourseCatalog) {
    this.coursesById = new Map(catalog.courses.map((course) => [course.id, course]));
  }

  findById(id: string): Course | undefined {
    return this.coursesById.get(id);
  }

  execute(query: CourseQuery): CourseSearchResult {
    const matched = this.catalog.courses
      .filter((course) => this.matches(course, query))
      .sort((left, right) => this.compare(left, right, query.sort));

    const totalPages = Math.ceil(matched.length / query.size);
    const start = (query.page - 1) * query.size;

    return {
      page: query.page,
      size: query.size,
      total: matched.length,
      totalPages,
      courses: matched.slice(start, start + query.size),
    };
  }

  private matches(course: Course, query: CourseQuery): boolean {
    if (query.keyword && !matchesKeyword(course, query.keyword)) return false;
    if (query.categories?.length && !query.categories.includes(course.category)) return false;
    if (!includedIn(query.departmentIds, course.department?.id ?? null)) return false;
    if (!includedIn(query.majorIds, course.major?.id ?? null)) return false;
    if (!includedIn(query.professors, course.professor)) return false;
    if (query.minCredits !== undefined && course.credits < query.minCredits) return false;
    if (query.maxCredits !== undefined && course.credits > query.maxCredits) return false;

    const { meetings } = course.schedule;

    // 요일은 포함 조건이다. 강의시간이 없는 강좌는 어떤 요일에도 만나지 않으므로 제외된다.
    if (query.days?.length) {
      const days = query.days;
      if (!meetings.some((meeting) => days.includes(meeting.day))) return false;
    }

    // 시간대는 제약 조건이다. 강의시간이 없는 강좌는 어떤 시간대와도 부딪히지 않으므로 남는다.
    if (query.startAfter && meetings.some((m) => (m.startTime ?? "00:00") < query.startAfter!)) {
      return false;
    }
    if (query.endBefore && meetings.some((m) => (m.endTime ?? "23:59") > query.endBefore!)) {
      return false;
    }

    return true;
  }

  // 정렬이 흔들리면 페이지 경계에서 강좌가 중복되거나 빠지므로 항상 id로 마지막 순서를 고정한다.
  private compare(left: Course, right: Course, sort: CourseSort): number {
    const primary =
      sort === "credits" ? left.credits - right.credits : left.name.localeCompare(right.name, "ko");

    return primary || left.id.localeCompare(right.id, "ko");
  }
}
