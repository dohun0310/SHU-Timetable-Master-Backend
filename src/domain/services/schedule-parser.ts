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

// SAP은 연속 교시 블록의 강의실을 한 교시에만 적기도 한다.
// "화 1교시 09:00-09:50화 2교시 10:00-10:50 (말씀관-B1020-강의실)"
// 그래서 한쪽에 강의실이 없으면 같은 강의실로 본다.
function sameRoom(left: string | null, right: string | null): boolean {
  return left === null || right === null || left === right;
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

  // 요일마다 블록을 여럿 열어 두고, 교시가 이어지면서 강의실이 맞는 블록에 붙인다.
  // 한 교시가 서로 다른 강의실로 두 번 나오는 강좌가 있어 블록이 하나뿐이라고 볼 수 없다.
  private mergeConsecutivePeriods(slots: PeriodSlot[]): CourseMeeting[] {
    const slotsByDay = new Map<Weekday, PeriodSlot[]>();
    for (const slot of slots) {
      const daySlots = slotsByDay.get(slot.day);
      if (daySlots) daySlots.push(slot);
      else slotsByDay.set(slot.day, [slot]);
    }

    const meetings: CourseMeeting[] = [];
    for (const daySlots of slotsByDay.values()) {
      const blocks: CourseMeeting[] = [];

      for (const slot of [...daySlots].sort((left, right) => left.period - right.period)) {
        const reachable = blocks.filter(
          (block) => block.endPeriod + 1 === slot.period && sameRoom(block.location, slot.location),
        );
        // 강의실이 똑같은 블록을 먼저 잇는다. 없으면 강의실이 비어 있는 쪽에 붙인다.
        const target = reachable.find((block) => block.location === slot.location) ?? reachable[0];

        if (target) {
          target.endPeriod = slot.period;
          target.endTime = slot.endTime;
          target.location ??= slot.location;
          continue;
        }

        blocks.push({
          day: slot.day,
          dayLabel: slot.dayLabel,
          startPeriod: slot.period,
          endPeriod: slot.period,
          startTime: slot.startTime,
          endTime: slot.endTime,
          location: slot.location,
        });
      }

      meetings.push(...blocks);
    }

    return meetings.sort(
      (left, right) =>
        weekdays.indexOf(left.day) - weekdays.indexOf(right.day) ||
        left.startPeriod - right.startPeriod,
    );
  }
}
