import { describe, expect, it } from "vitest";

import { PROJECT_NAME } from "../../src/project.js";

describe("project metadata", () => {
  it("exposes the backend package name", () => {
    expect(PROJECT_NAME).toBe("shu-timetable-master-backend");
  });
});
