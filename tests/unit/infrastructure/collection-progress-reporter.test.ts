import { describe, expect, it } from "vitest";

import {
  formatDuration,
  formatProgress,
} from "../../../src/infrastructure/console/collection-progress-reporter.js";

describe("formatProgress", () => {
  it("shows which tab started and how many are left", () => {
    expect(formatProgress({ type: "PHASE_STARTED", label: "학과/전공", index: 6, total: 6 })).toBe(
      "[6/6] 학과/전공",
    );
  });

  it("lines up the unit counters so long runs stay readable", () => {
    expect(
      formatProgress({
        type: "UNIT_COLLECTED",
        label: "간호학과",
        index: 42,
        total: 128,
        courses: 68,
      }),
    ).toBe("  [ 42/128] 간호학과 … 68건");
  });

  it("shows how many courses a tab yielded", () => {
    expect(formatProgress({ type: "PHASE_FINISHED", label: "학과/전공", courses: 980 })).toBe(
      "        └ 980건",
    );
  });
});

describe("formatDuration", () => {
  it("reads as minutes and seconds once a run passes a minute", () => {
    expect(formatDuration(754_000)).toBe("12분 34초");
  });

  it("reads as seconds for a short run", () => {
    expect(formatDuration(42_000)).toBe("42초");
  });
});
