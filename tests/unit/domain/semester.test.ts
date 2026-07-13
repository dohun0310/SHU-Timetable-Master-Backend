import { describe, expect, it } from "vitest";

import {
  parseSemester,
  sapSemesterKeys,
  semesterLabels,
} from "../../../src/domain/value-objects/semester.js";

describe("parseSemester", () => {
  it("accepts a supported semester", () => {
    expect(parseSemester("SECOND")).toBe("SECOND");
    expect(semesterLabels.SECOND).toBe("2학기");
    expect(sapSemesterKeys.SECOND).toBe("210");
  });

  it("rejects an unsupported semester", () => {
    expect(() => parseSemester("AUTUMN")).toThrow(
      "TARGET_SEMESTER는 FIRST, SUMMER, SECOND, WINTER 중 하나여야 합니다.",
    );
  });
});
