import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { KoreanPeriodScheduleParser } from "../../../src/domain/services/schedule-parser.js";

describe("KoreanPeriodScheduleParser", () => {
  const parser = new KoreanPeriodScheduleParser();

  it("parses a single period with a location", () => {
    const raw = "목 5교시 13:00-13:50 (제1캠퍼스 에벤에셀관-B2070)";

    expect(parser.parse(raw)).toEqual({
      raw,
      parseStatus: "PARSED",
      meetings: [
        {
          day: "THURSDAY",
          dayLabel: "목",
          startPeriod: 5,
          endPeriod: 5,
          startTime: "13:00",
          endTime: "13:50",
          location: "제1캠퍼스 에벤에셀관-B2070",
        },
      ],
    });
  });

  it("merges consecutive periods in the same room into one meeting", () => {
    const raw =
      "월 2교시 10:00-10:50 (말씀관-2160-강의실)월 3교시 11:00-11:50 (말씀관-2160-강의실)";

    expect(parser.parse(raw)).toEqual({
      raw,
      parseStatus: "PARSED",
      meetings: [
        {
          day: "MONDAY",
          dayLabel: "월",
          startPeriod: 2,
          endPeriod: 3,
          startTime: "10:00",
          endTime: "11:50",
          location: "말씀관-2160-강의실",
        },
      ],
    });
  });

  it("parses periods that carry no location", () => {
    const raw = "수 2교시 10:00-10:50수 3교시 11:00-11:50";

    expect(parser.parse(raw)).toEqual({
      raw,
      parseStatus: "PARSED",
      meetings: [
        {
          day: "WEDNESDAY",
          dayLabel: "수",
          startPeriod: 2,
          endPeriod: 3,
          startTime: "10:00",
          endTime: "11:50",
          location: null,
        },
      ],
    });
  });

  it("keeps nested parentheses inside a location", () => {
    const raw =
      "화 1교시 09:00-09:50 (제1캠퍼스 은혜관-B2120(풋살장))화 2교시 10:00-10:50 (제1캠퍼스 은혜관-B2120(풋살장))";

    expect(parser.parse(raw).meetings).toEqual([
      {
        day: "TUESDAY",
        dayLabel: "화",
        startPeriod: 1,
        endPeriod: 2,
        startTime: "09:00",
        endTime: "10:50",
        location: "제1캠퍼스 은혜관-B2120(풋살장)",
      },
    ]);
  });

  it("keeps a spaced nested parenthesis inside a location", () => {
    const raw = "화 7교시 15:00-15:50 (믿음관-B1040 (구 본관))";

    expect(parser.parse(raw).meetings[0]?.location).toBe("믿음관-B1040 (구 본관)");
  });

  it("splits a period taught in two rooms into one meeting per room", () => {
    const raw =
      "목 1교시 09:00-09:50 (은혜관-2220-전산실습실 4)목 1교시 09:00-09:50 (기도관-1250-메이커스페이스)" +
      "목 2교시 10:00-10:50 (은혜관-2220-전산실습실 4)목 2교시 10:00-10:50 (기도관-1250-메이커스페이스)";

    expect(parser.parse(raw)).toEqual({
      raw,
      parseStatus: "PARSED",
      meetings: [
        {
          day: "THURSDAY",
          dayLabel: "목",
          startPeriod: 1,
          endPeriod: 2,
          startTime: "09:00",
          endTime: "10:50",
          location: "은혜관-2220-전산실습실 4",
        },
        {
          day: "THURSDAY",
          dayLabel: "목",
          startPeriod: 1,
          endPeriod: 2,
          startTime: "09:00",
          endTime: "10:50",
          location: "기도관-1250-메이커스페이스",
        },
      ],
    });
  });

  it("merges a period that carries no room into the block that names one", () => {
    // SAP은 연속 교시 블록의 강의실을 마지막 교시에만 적는다.
    const raw = "화 1교시 09:00-09:50화 2교시 10:00-10:50 (말씀관-B1020-강의실)";

    expect(parser.parse(raw)).toEqual({
      raw,
      parseStatus: "PARSED",
      meetings: [
        {
          day: "TUESDAY",
          dayLabel: "화",
          startPeriod: 1,
          endPeriod: 2,
          startTime: "09:00",
          endTime: "10:50",
          location: "말씀관-B1020-강의실",
        },
      ],
    });
  });

  it("merges a trailing period that carries no room into the block before it", () => {
    const raw = "월 4교시 12:00-12:50 (말씀관-2190-강의실)월 5교시 13:00-13:50";

    expect(parser.parse(raw).meetings).toEqual([
      {
        day: "MONDAY",
        dayLabel: "월",
        startPeriod: 4,
        endPeriod: 5,
        startTime: "12:00",
        endTime: "13:50",
        location: "말씀관-2190-강의실",
      },
    ]);
  });

  it("does not merge consecutive periods held in different rooms", () => {
    const raw =
      "월 2교시 10:00-10:50 (말씀관-2160-강의실)월 3교시 11:00-11:50 (은혜관-5060-강의실)";

    expect(parser.parse(raw).meetings).toEqual([
      {
        day: "MONDAY",
        dayLabel: "월",
        startPeriod: 2,
        endPeriod: 2,
        startTime: "10:00",
        endTime: "10:50",
        location: "말씀관-2160-강의실",
      },
      {
        day: "MONDAY",
        dayLabel: "월",
        startPeriod: 3,
        endPeriod: 3,
        startTime: "11:00",
        endTime: "11:50",
        location: "은혜관-5060-강의실",
      },
    ]);
  });

  it("does not merge periods that are not consecutive", () => {
    const raw =
      "월 2교시 10:00-10:50 (말씀관-2160-강의실)월 5교시 13:00-13:50 (말씀관-2160-강의실)";

    expect(parser.parse(raw).meetings).toEqual([
      {
        day: "MONDAY",
        dayLabel: "월",
        startPeriod: 2,
        endPeriod: 2,
        startTime: "10:00",
        endTime: "10:50",
        location: "말씀관-2160-강의실",
      },
      {
        day: "MONDAY",
        dayLabel: "월",
        startPeriod: 5,
        endPeriod: 5,
        startTime: "13:00",
        endTime: "13:50",
        location: "말씀관-2160-강의실",
      },
    ]);
  });

  it("parses evening periods", () => {
    expect(parser.parse("금 13교시 20:45-21:35 (말씀관-2010-강의실)").meetings).toEqual([
      {
        day: "FRIDAY",
        dayLabel: "금",
        startPeriod: 13,
        endPeriod: 13,
        startTime: "20:45",
        endTime: "21:35",
        location: "말씀관-2010-강의실",
      },
    ]);
  });

  it("marks a schedule truncated mid-token as partially parsed", () => {
    const raw =
      "금 1교시 09:00-09:50 (기도관-4110 GPU실습실)금 2교시 10:00-10:50 (기도관-4110 GPU실습실)금 8";

    const schedule = parser.parse(raw);

    expect(schedule.parseStatus).toBe("PARTIALLY_PARSED");
    expect(schedule.meetings).toEqual([
      {
        day: "FRIDAY",
        dayLabel: "금",
        startPeriod: 1,
        endPeriod: 2,
        startTime: "09:00",
        endTime: "10:50",
        location: "기도관-4110 GPU실습실",
      },
    ]);
  });

  it("preserves a schedule that carries a room but no time", () => {
    expect(parser.parse("은혜관-5060-강의실")).toEqual({
      raw: "은혜관-5060-강의실",
      parseStatus: "UNPARSED",
      meetings: [],
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

// 수집된 카탈로그가 있으면 SAP 원문 전량을 실제로 파싱해 본다.
// SAP이 형식을 바꾸면 meetings가 조용히 비는 대신 여기서 먼저 드러난다.
const catalogPath = resolve("generated/catalog.json");

describe.skipIf(!existsSync(catalogPath))(
  "KoreanPeriodScheduleParser against collected SAP data",
  () => {
    const parser = new KoreanPeriodScheduleParser();
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as {
      courses: { schedule: { raw: string } }[];
    };
    const rawSchedules = catalog.courses
      .map((course) => course.schedule.raw)
      .filter((raw) => raw.trim().length > 0);

    it("fully parses at least 99% of the schedules SAP provides", () => {
      const parsed = rawSchedules.filter(
        (raw) => parser.parse(raw).parseStatus === "PARSED",
      ).length;

      expect(rawSchedules.length).toBeGreaterThan(0);
      expect(parsed / rawSchedules.length).toBeGreaterThanOrEqual(0.99);
    });

    it("never returns a parsed schedule without meetings", () => {
      const emptyButParsed = rawSchedules.filter((raw) => {
        const schedule = parser.parse(raw);
        return schedule.parseStatus === "PARSED" && schedule.meetings.length === 0;
      });

      expect(emptyButParsed).toEqual([]);
    });

    it("leaves no consecutive periods unmerged", () => {
      const unmerged = rawSchedules.filter((raw) =>
        parser.parse(raw).meetings.some((left, index, meetings) =>
          meetings.some(
            (right, otherIndex) =>
              index !== otherIndex &&
              left.day === right.day &&
              left.endPeriod + 1 === right.startPeriod &&
              // 강의실이 다르면 서로 다른 수업이므로 합치지 않는 것이 맞다.
              (left.location === right.location ||
                left.location === null ||
                right.location === null),
          ),
        ),
      );

      expect(unmerged).toEqual([]);
    });
  },
);
