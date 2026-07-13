import { describe, expect, it } from "vitest";

import { KoreanPeriodScheduleParser } from "../../../src/domain/services/schedule-parser.js";

describe("KoreanPeriodScheduleParser", () => {
  const parser = new KoreanPeriodScheduleParser();

  it("parses multiple weekday and period ranges", () => {
    expect(parser.parse("월 1-2, 수 3")).toEqual({
      raw: "월 1-2, 수 3",
      parseStatus: "PARSED",
      meetings: [
        {
          day: "MONDAY",
          dayLabel: "월",
          startPeriod: 1,
          endPeriod: 2,
          startTime: null,
          endTime: null,
          location: null,
        },
        {
          day: "WEDNESDAY",
          dayLabel: "수",
          startPeriod: 3,
          endPeriod: 3,
          startTime: null,
          endTime: null,
          location: null,
        },
      ],
    });
  });

  it("preserves an unparseable schedule", () => {
    expect(parser.parse("집중수업 별도 공지")).toEqual({
      raw: "집중수업 별도 공지",
      parseStatus: "UNPARSED",
      meetings: [],
    });
  });

  it("marks an empty schedule as absent", () => {
    expect(parser.parse("  ")).toEqual({
      raw: "",
      parseStatus: "NO_SCHEDULE",
      meetings: [],
    });
  });
});
