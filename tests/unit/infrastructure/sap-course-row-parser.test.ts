import { describe, expect, it } from "vitest";

import { SapCourseRowParser } from "../../../src/infrastructure/sap/sap-course-row-parser.js";

describe("SapCourseRowParser", () => {
  const parser = new SapCourseRowParser();

  it("maps SAP table cells to a raw course", () => {
    expect(
      parser.parse(
        [
          "이론",
          "교양교육원",
          "필수",
          "",
          "GE61002",
          "홍길동",
          "리나시타교양대학",
          "월 1-2",
          "40",
          "001",
          "",
          "",
          "",
          "계획",
          "1/1/0",
          "기독교의 이해",
        ],
        { tab: "기초교양", category: "BASIC_LIBERAL_ARTS" },
      ),
    ).toEqual({
      category: "BASIC_LIBERAL_ARTS",
      tab: "기초교양",
      lectureType: "이론",
      passFail: false,
      courseCode: "GE61002",
      professor: "홍길동",
      majorName: "리나시타교양대학",
      classTime: "월 1-2",
      requirement: "필수",
      courseName: "기독교의 이해",
      departmentName: "교양교육원",
      capacity: 40,
      classNumber: "001",
      credits: 1,
      theoryHours: 1,
      practiceHours: 0,
      hours: 1,
    });
  });

  it("rejects a row without a course code", () => {
    const cells = Array.from({ length: 16 }, () => "");
    expect(() =>
      parser.parse(cells, { tab: "기초교양", category: "BASIC_LIBERAL_ARTS" }),
    ).toThrow("SAP 강좌 행에 과목코드가 없습니다.");
  });
});
