import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadCourseCatalog } from "../../../src/infrastructure/json/load-course-catalog.js";

describe("loadCourseCatalog", () => {
  it("fails clearly when the catalog is missing or invalid", async () => {
    const directory = await mkdtemp(join(tmpdir(), "catalog-loader-"));
    try {
      await expect(loadCourseCatalog(join(directory, "missing.json"))).rejects.toThrow(
        "강좌 카탈로그 파일을 읽을 수 없습니다",
      );
      const invalidPath = join(directory, "invalid.json");
      await writeFile(invalidPath, '{"invalid":true}', "utf8");
      await expect(loadCourseCatalog(invalidPath)).rejects.toThrow(
        "강좌 카탈로그 파일이 올바르지 않습니다",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
