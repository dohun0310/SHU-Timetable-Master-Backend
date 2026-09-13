import { describe, expect, it } from "vitest";

import { SapCourseRowParser } from "../../../src/infrastructure/sap/sap-course-row-parser.js";

// 수집기가 셀을 이 순서로 정렬해 넘긴다. 인덱스가 어떤 열인지 헷갈리면 학과와 전공이 뒤바뀐다.
const cells = (overrides: Partial<Record<string, string>> = {}): string[] => {
  const byHeader: Record<string, string> = {
    강의유형: "이론",
    과목번호: "GE61002",
    담당교수: "홍길동",
    강의시간: "월 1교시 09:00-09:50",
    주관학과: "리나시타교양대학",
    이수구분: "필수",
    "PF/PN여부": "",
    전공: "교양전공",
    정원: "40",
    분반: "001",
    수강자격: "",
    수강유의사항: "",
    "수업계획서 영상": "",
    계획: "계획",
    "학점/이론/실습": "1/1/0",
    과목명: "기독교의 이해",
    ...overrides,
  };

  return [
    "강의유형",
    "과목번호",
    "담당교수",
    "강의시간",
    "주관학과",
    "이수구분",
    "PF/PN여부",
    "전공",
    "정원",
    "분반",
    "수강자격",
    "수강유의사항",
    "수업계획서 영상",
    "계획",
    "학점/이론/실습",
    "과목명",
  ].map((header) => byHeader[header] ?? "");
};

const basic = { tab: "기초교양", category: "BASIC_LIBERAL_ARTS" } as const;

describe("SapCourseRowParser", () => {
  const parser = new SapCourseRowParser();

  it("maps SAP table cells to a raw course", () => {
    expect(parser.parse(cells(), basic)).toEqual({
      category: "BASIC_LIBERAL_ARTS",
      tab: "기초교양",
      lectureType: "이론",
      passFail: false,
      courseCode: "GE61002",
      professors: ["홍길동"],
      classTime: "월 1교시 09:00-09:50",
      requirement: "필수",
      courseName: "기독교의 이해",
      departmentName: "리나시타교양대학",
      majorNames: ["교양전공"],
      capacity: 40,
      classNumber: "001",
      credits: 1,
      theoryHours: 1,
      practiceHours: 0,
      hours: 1,
    });
  });

  it("reads the department from 주관학과 and the major from 전공, not the other way round", () => {
    const course = parser.parse(cells({ 주관학과: "간호학과", 전공: "간호학전공" }), basic);

    expect(course.departmentName).toBe("간호학과");
    expect(course.majorNames).toEqual(["간호학전공"]);
  });

  it("keeps one name when SAP lists the same major twice", () => {
    // SAP은 한 셀에 값을 여러 줄로 담는다. 같은 값이 반복되면 "간호학과간호학과"가 되어
    // 학과 필터가 둘로 갈라진다.
    const course = parser.parse(cells({ 전공: "간호학과\n간호학과" }), basic);

    expect(course.majorNames).toEqual(["간호학과"]);
  });

  it("keeps every distinct name when SAP lists several majors", () => {
    const course = parser.parse(cells({ 전공: "미디어MD크리에이터\n영상콘텐츠 제작" }), basic);

    expect(course.majorNames).toEqual(["미디어MD크리에이터", "영상콘텐츠 제작"]);
  });

  it("keeps a comma inside a single name instead of splitting it", () => {
    // "베이커리, 카페 창업" 은 쉼표가 든 하나의 마이크로디그리 과정명이다.
    // 값을 한 문자열로 이어 붙이면 두 전공과 구분할 수 없다.
    const course = parser.parse(cells({ 전공: "베이커리, 카페 창업" }), basic);

    expect(course.majorNames).toEqual(["베이커리, 카페 창업"]);
  });

  it("keeps every professor when a course is taught by more than one", () => {
    const course = parser.parse(cells({ 담당교수: "배진택\n임채훈" }), basic);

    expect(course.professors).toEqual(["배진택", "임채훈"]);
  });

  it("keeps the class time as SAP lists it, one meeting per line", () => {
    const course = parser.parse(
      cells({ 강의시간: "월 1교시 09:00-09:50 (은혜관)\n월 2교시 10:00-10:50 (은혜관)" }),
      basic,
    );

    expect(course.classTime).toBe("월 1교시 09:00-09:50 (은혜관)\n월 2교시 10:00-10:50 (은혜관)");
  });

  it("maps the major and micro-degree table layout", () => {
    expect(
      parser.parse(
        cells({
          강의유형: "",
          과목번호: "KP30002",
          담당교수: "배진택\n임채훈",
          강의시간: "화 7교시 15:00-15:50",
          주관학과: "K-POP학과",
          이수구분: "전필",
          전공: "K-POP학과",
          정원: "24",
          계획: "실행",
          "학점/이론/실습": "3/1/2",
          과목명: "캡스톤디자인(졸업공연제작)",
        }),
        { tab: "학과/전공", category: "MAJOR" },
      ),
    ).toMatchObject({
      courseCode: "KP30002",
      professors: ["배진택", "임채훈"],
      departmentName: "K-POP학과",
      majorNames: ["K-POP학과"],
      capacity: 24,
      courseName: "캡스톤디자인(졸업공연제작)",
      credits: 3,
      theoryHours: 1,
      practiceHours: 2,
    });
  });

  it("rejects a row without a course code", () => {
    expect(() => parser.parse(cells({ 과목번호: "" }), basic)).toThrow(
      "SAP 강좌 행에 과목코드가 없습니다.",
    );
  });
});
