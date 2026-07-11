import type { CourseMeeting, CourseSchedule, Weekday } from "../value-objects/course-schedule.js";

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

const meetingPattern = /^(월|화|수|목|금|토|일)\s*(\d+)(?:\s*[-~]\s*(\d+))?$/;

export class KoreanPeriodScheduleParser implements ScheduleParser {
  parse(rawSchedule: string): CourseSchedule {
    const raw = rawSchedule.trim();

    if (raw.length === 0) {
      return { raw, parseStatus: "NO_SCHEDULE", meetings: [] };
    }

    const segments = raw.split(/\s*[,/]\s*/).filter(Boolean);
    const meetings: CourseMeeting[] = [];

    for (const segment of segments) {
      const match = meetingPattern.exec(segment);
      if (!match) {
        return {
          raw,
          parseStatus: meetings.length === 0 ? "UNPARSED" : "PARTIALLY_PARSED",
          meetings,
        };
      }

      const [, dayLabel, startPeriodText, endPeriodText] = match;
      if (!dayLabel || !startPeriodText) {
        return { raw, parseStatus: "UNPARSED", meetings: [] };
      }

      const day = weekdaysByLabel[dayLabel];
      if (!day) {
        return { raw, parseStatus: "UNPARSED", meetings: [] };
      }

      const startPeriod = Number(startPeriodText);
      const endPeriod = Number(endPeriodText ?? startPeriodText);

      meetings.push({
        day,
        dayLabel,
        startPeriod,
        endPeriod,
        startTime: null,
        endTime: null,
        location: null,
      });
    }

    return { raw, parseStatus: "PARSED", meetings };
  }
}
