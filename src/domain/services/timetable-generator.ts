import type { Course } from "../schemas/catalog-schema.js";
import { weekdays, type Weekday } from "../value-objects/course-schedule.js";
import type { TimetableConflictDetector } from "./timetable-conflict-detector.js";

export interface TimetableBasket {
  label: string;
  required: boolean;
  courses: Course[];
}

export interface TimetableConstraints {
  freeDays?: Weekday[] | undefined;
  avoidBefore?: string | undefined;
  avoidAfter?: string | undefined;
  minCredits?: number | undefined;
  maxCredits?: number | undefined;
}

export interface GenerateTimetablesInput {
  baskets: TimetableBasket[];
  constraints?: TimetableConstraints | undefined;
  limit: number;
}

export interface Timetable {
  courses: Course[];
  totalCredits: number;
  days: Weekday[];
  freeDays: Weekday[];
}

export interface TimetableGenerationResult {
  count: number;
  truncated: boolean;
  timetables: Timetable[];
}

// 시간표가 온전히 파싱되지 않은 강좌는 충돌 판정을 신뢰할 수 없다.
// 잘못된 시간표를 조용히 만들어 주는 것보다 거부하는 편이 낫다.
export class UnschedulableCourseError extends Error {
  constructor(readonly courses: Course[]) {
    super(
      `강의시간을 온전히 알 수 없어 시간표를 만들 수 없는 강좌가 있습니다: ${courses
        .map((course) => course.name)
        .join(", ")}`,
    );
    this.name = "UnschedulableCourseError";
  }
}

// 후보가 많으면 조합 수가 폭발한다. 탐색 노드에 상한을 두고, 걸리면 잘렸다고 알린다.
const maxSearchNodes = 200_000;

export class TimetableGenerator {
  constructor(private readonly conflicts: TimetableConflictDetector) {}

  generate(input: GenerateTimetablesInput): TimetableGenerationResult {
    this.rejectUnschedulable(input.baskets);

    const constraints = input.constraints ?? {};

    // 요일과 시간대는 강좌 하나만 보고도 판정할 수 있다. 탐색 전에 미리 걸러 두면 가지치기가 줄어든다.
    const filtered = input.baskets.map((basket, position) => ({
      ...basket,
      position,
      courses: basket.courses.filter((course) => this.fitsTimeConstraints(course, constraints)),
    }));

    if (filtered.some((basket) => basket.required && basket.courses.length === 0)) {
      return { count: 0, truncated: false, timetables: [] };
    }

    // 분반이 적은 바구니부터 고르면 충돌이 탐색 초반에 드러난다. 담은 순서대로 고르면
    // 분반이 적은 바구니가 뒤에 있을 때 앞쪽 조합을 다 만들고서야 충돌을 알게 되어,
    // 가능한 시간표가 있어도 탐색 상한에 먼저 걸린다. 분반 수가 같으면 담은 순서를 따른다.
    const baskets = filtered.toSorted((left, right) => left.courses.length - right.courses.length);

    // limit + 1 개까지 모아 보면 상한에 걸렸는지를 정확히 알 수 있다.
    const wanted = input.limit + 1;
    const found: Course[][] = [];
    // 고른 강좌와 그 강좌가 나온 바구니의 원래 위치. 응답은 사용자가 담은 바구니 순서로 돌려준다.
    const chosen: { position: number; course: Course }[] = [];
    let visited = 0;
    let exhausted = true;

    const search = (index: number, credits: number): void => {
      if (found.length >= wanted || visited >= maxSearchNodes) {
        exhausted = false;
        return;
      }

      if (index === baskets.length) {
        if (constraints.minCredits === undefined || credits >= constraints.minCredits) {
          found.push(
            chosen
              .toSorted((left, right) => left.position - right.position)
              .map((pick) => pick.course),
          );
        }
        return;
      }

      const basket = baskets[index]!;

      for (const course of basket.courses) {
        visited += 1;
        if (visited >= maxSearchNodes) {
          exhausted = false;
          break;
        }

        if (
          constraints.maxCredits !== undefined &&
          credits + course.credits > constraints.maxCredits
        ) {
          continue;
        }

        // 같은 강좌를 두 바구니에 담을 수 있다. 강의시간이 없는 강좌는 자기 자신과도 겹치지 않아
        // 충돌 검사만으로는 걸러지지 않으므로 id로 막는다.
        if (chosen.some((picked) => picked.course.id === course.id)) continue;
        if (chosen.some((picked) => this.conflict(picked.course, course))) continue;

        chosen.push({ position: basket.position, course });
        search(index + 1, credits + course.credits);
        chosen.pop();

        if (found.length >= wanted) return;
      }

      if (!basket.required) search(index + 1, credits);
    };

    search(0, 0);

    const truncated = !exhausted || found.length > input.limit;
    const timetables = found.slice(0, input.limit).map((courses) => this.toTimetable(courses));

    return { count: timetables.length, truncated, timetables };
  }

  private conflict(left: Course, right: Course): boolean {
    return this.conflicts.conflicts(left.schedule.meetings, right.schedule.meetings);
  }

  private rejectUnschedulable(baskets: TimetableBasket[]): void {
    const refused = baskets
      .flatMap((basket) => basket.courses)
      .filter(
        (course) =>
          course.schedule.parseStatus === "UNPARSED" ||
          course.schedule.parseStatus === "PARTIALLY_PARSED",
      );

    if (refused.length > 0) throw new UnschedulableCourseError(refused);
  }

  // 강의시간이 없는 강좌(사이버 강의 등)는 어떤 요일·시간대와도 부딪히지 않으므로 항상 통과한다.
  private fitsTimeConstraints(course: Course, constraints: TimetableConstraints): boolean {
    return course.schedule.meetings.every((meeting) => {
      if (constraints.freeDays?.includes(meeting.day)) return false;
      if (constraints.avoidBefore && (meeting.startTime ?? "00:00") < constraints.avoidBefore) {
        return false;
      }
      if (constraints.avoidAfter && (meeting.endTime ?? "23:59") > constraints.avoidAfter) {
        return false;
      }
      return true;
    });
  }

  private toTimetable(courses: Course[]): Timetable {
    const used = new Set(
      courses.flatMap((course) => course.schedule.meetings.map((meeting) => meeting.day)),
    );

    return {
      courses,
      totalCredits: courses.reduce((sum, course) => sum + course.credits, 0),
      days: weekdays.filter((day) => used.has(day)),
      freeDays: weekdays.filter((day) => !used.has(day)),
    };
  }
}
