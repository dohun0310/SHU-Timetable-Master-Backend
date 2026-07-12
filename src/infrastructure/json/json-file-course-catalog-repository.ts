import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { CourseCatalogRepository } from "../../application/ports/course-catalog-repository.js";
import { catalogSchema, type CourseCatalog } from "../../domain/schemas/catalog-schema.js";

export class JsonFileCourseCatalogRepository implements CourseCatalogRepository {
  constructor(private readonly outputPath: string) {}

  async save(catalog: CourseCatalog): Promise<void> {
    const validated = catalogSchema.parse(catalog);
    const directory = dirname(this.outputPath);
    const temporaryPath = `${this.outputPath}.${process.pid}.${Date.now()}.tmp`;
    await mkdir(directory, { recursive: true });

    try {
      await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
      await rename(temporaryPath, this.outputPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw new Error(`강좌 카탈로그 저장 실패: ${this.outputPath}`, { cause: error });
    }
  }
}
