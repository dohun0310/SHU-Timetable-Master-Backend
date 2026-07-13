import {
  weekdays,
  type CourseMeeting,
  type CourseSchedule,
  type Weekday,
} from "../value-objects/course-schedule.js";

export interface ScheduleParser {
  parse(rawSchedule: string): CourseSchedule;
}

const weekdaysByLabel: Record<string, Weekday> = {
  월: "MONDAY",
  화: "TUESDAY",
  수: "WEDNESDAY",
  목: "THURSDAY",
  금: "FRIDAY",
  토: "SATURDAY",
  일: "SUNDAY",
};

// SAP은 교시를 구분자 없이 이어 붙인다.
// "월 2교시 10:00-10:50 (말씀관-2160-강의실)월 3교시 11:00-11:50 (말씀관-2160-강의실)"
const periodBoundary = /(?=[월화수목금토일]\s*\d+교시)/;

// 강의실 이름에 괄호가 중첩될 수 있어 바깥 괄호를 greedy로 잡는다. "(은혜관-B2120(풋살장))"
// 원문이 잘려 꼬리 조각이 붙어 있을 수 있으므로 끝을 고정하지 않고, 남은 부분은 따로 확인한다.
const periodPattern =
  /^([월화수목금토일])\s*(\d+)교시\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*(?:\((.*)\))?/;

interface PeriodSlot {
  day: Weekday;
  dayLabel: string;
  period: number;
  startTime: string;
  endTime: string;
  location: string | null;
}

interface SegmentReading {
  slot: PeriodSlot | null;
  leftover: string;
}

export class KoreanPeriodScheduleParser implements ScheduleParser {
  parse(rawSchedule: string): CourseSchedule {
    const raw = rawSchedule.trim();

    if (raw.length === 0) {
      return { raw, parseStatus: "NO_SCHEDULE", meetings: [] };
    }

    const segments = raw
      .split(periodBoundary)
      .map((segment) => segment.trim())
      .filter(Boolean);

    const slots: PeriodSlot[] = [];
    let unreadable = 0;

    for (const segment of segments) {
      const { slot, leftover } = this.readSegment(segment);
      if (slot) slots.push(slot);
      if (!slot || leftover.length > 0) unreadable += 1;
    }

    const meetings = this.mergeConsecutivePeriods(slots);

    if (meetings.length === 0) {
      return { raw, parseStatus: "UNPARSED", meetings: [] };
    }

    return { raw, parseStatus: unreadable === 0 ? "PARSED" : "PARTIALLY_PARSED", meetings };
  }

  private readSegment(segment: string): SegmentReading {
    const match = periodPattern.exec(segment);
    if (!match) return { slot: null, leftover: segment };

    const [matched, dayLabel = "", period = "", startTime = "", endTime = "", location] = match;
    const day = weekdaysByLabel[dayLabel];
    if (!day) return { slot: null, leftover: segment };

    return {
      slot: {
        day,
        dayLabel,
        period: Number(period),
        startTime,
        endTime,
        location: location?.trim() ? location.trim() : null,
      },
      leftover: segment.slice(matched.length).trim(),
    };
  }

  // 같은 요일·같은 강의실에서 교시가 이어지면 하나의 meeting으로 합친다.
  // 한 교시가 서로 다른 강의실로 두 번 나오는 강좌가 있어 인접 교시만 비교해서는 안 된다.
  private mergeConsecutivePeriods(slots: PeriodSlot[]): CourseMeeting[] {
    const groups = new Map<string, PeriodSlot[]>();
    for (const slot of slots) {
      const key = `${slot.day} ${slot.location ?? ""}`;
      const group = groups.get(key);
      if (group) group.push(slot);
      else groups.set(key, [slot]);
    }

    const meetings: CourseMeeting[] = [];
    for (const group of groups.values()) {
      let current: CourseMeeting | null = null;

      for (const slot of [...group].sort((left, right) => left.period - right.period)) {
        if (current && current.endPeriod + 1 === slot.period) {
          current.endPeriod = slot.period;
          current.endTime = slot.endTime;
          continue;
        }

        current = {
          day: slot.day,
          dayLabel: slot.dayLabel,
          startPeriod: slot.period,
          endPeriod: slot.period,
          startTime: slot.startTime,
          endTime: slot.endTime,
          location: slot.location,
        };
        meetings.push(current);
      }
    }

    return meetings.sort(
      (left, right) =>
        weekdays.indexOf(left.day) - weekdays.indexOf(right.day) ||
        left.startPeriod - right.startPeriod,
    );
  }
}
