import { describe, expect, it } from "vitest";

import { DefaultCourseIdGenerator } from "../../../src/domain/services/course-id-generator.js";

describe("DefaultCourseIdGenerator", () => {
  const generator = new DefaultCourseIdGenerator();

  it("creates a stable identifier from course identity fields", () => {
    expect(
      generator.generate({
        academicYear: 2026,
        semester: "SECOND",
        courseCode: "CSE101",
        classNumber: "01",
        departmentId: "computer-engineering",
      }),
    ).toBe("2026-second-cse101-01-computer-engineering");
  });

  it("omits an absent department identifier", () => {
    expect(
      generator.generate({
        academicYear: 2026,
        semester: "SECOND",
        courseCode: "GE101",
        classNumber: "02",
        departmentId: null,
      }),
    ).toBe("2026-second-ge101-02");
  });
});
