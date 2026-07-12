import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { JsonFileCourseCatalogRepository } from "../../../src/infrastructure/json/json-file-course-catalog-repository.js";
import { catalogSchema } from "../../../src/domain/schemas/catalog-schema.js";

const validCatalog = catalogSchema.parse({
  meta: {
    academicYear: 2026,
    semester: "SECOND",
    generatedAt: "2026-07-12T00:00:00.000Z",
    source: "https://example.com/sap",
    courseCount: 0,
  },
  filters: { categories: [], departments: [], majors: [], professors: [], days: [] },
  courses: [],
});

describe("JsonFileCourseCatalogRepository", () => {
  it("writes a validated catalog atomically", async () => {
    const directory = await mkdtemp(join(tmpdir(), "catalog-"));
    const path = join(directory, "nested", "catalog.json");
    try {
      await new JsonFileCourseCatalogRepository(path).save(validCatalog);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(validCatalog);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves an existing catalog when validation fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "catalog-"));
    const path = join(directory, "catalog.json");
    await writeFile(path, "existing", "utf8");
    try {
      await expect(
        new JsonFileCourseCatalogRepository(path).save({
          ...validCatalog,
          meta: { ...validCatalog.meta, courseCount: 1 },
        }),
      ).rejects.toThrow();
      expect(await readFile(path, "utf8")).toBe("existing");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
