import { describe, expect, it } from "vitest";

import { loadAppConfig } from "../../src/config/app-config.js";

describe("loadAppConfig", () => {
  it("loads the target academic period", () => {
    expect(
      loadAppConfig({
        TARGET_ACADEMIC_YEAR: "2026",
        TARGET_SEMESTER: "SECOND",
        SAP_COURSE_URL: "https://example.com/course-catalog",
        PORT: "4000",
      }),
    ).toEqual({
      targetAcademicYear: 2026,
      targetSemester: "SECOND",
      sapCourseUrl: "https://example.com/course-catalog",
      port: 4000,
      playwrightHeadless: true,
    });
  });

  it("rejects an invalid academic year", () => {
    expect(() =>
      loadAppConfig({
        TARGET_ACADEMIC_YEAR: "year-2026",
        TARGET_SEMESTER: "SECOND",
        SAP_COURSE_URL: "https://example.com/course-catalog",
      }),
    ).toThrow("TARGET_ACADEMIC_YEAR는 2000 이상의 정수여야 합니다.");
  });
});
