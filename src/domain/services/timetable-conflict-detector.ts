import type { CourseMeeting } from "../value-objects/course-schedule.js";

// 겹침은 시각 문자열이 아니라 교시로 판정한다. 교시는 1~15의 정수로 정규화돼 있어 더 안전하고,
// 강의시간이 없는 강좌(사이버 강의 등)는 meetings가 비어 있으므로 자연히 아무와도 겹치지 않는다.
export class TimetableConflictDetector {
  conflicts(left: readonly CourseMeeting[], right: readonly CourseMeeting[]): boolean {
    return left.some((leftMeeting) =>
      right.some(
        (rightMeeting) =>
          leftMeeting.day === rightMeeting.day &&
          leftMeeting.startPeriod <= rightMeeting.endPeriod &&
          rightMeeting.startPeriod <= leftMeeting.endPeriod,
      ),
    );
  }
}
