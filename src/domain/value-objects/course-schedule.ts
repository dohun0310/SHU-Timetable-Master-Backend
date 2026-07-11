export const weekdays = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export type Weekday = (typeof weekdays)[number];

export type ScheduleParseStatus = "PARSED" | "PARTIALLY_PARSED" | "UNPARSED" | "NO_SCHEDULE";

export interface CourseMeeting {
  day: Weekday;
  dayLabel: string;
  startPeriod: number;
  endPeriod: number;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
}

export interface CourseSchedule {
  raw: string;
  parseStatus: ScheduleParseStatus;
  meetings: CourseMeeting[];
}
