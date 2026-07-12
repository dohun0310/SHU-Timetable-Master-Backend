import { readFile } from "node:fs/promises";

import { catalogSchema, type CourseCatalog } from "../../domain/schemas/catalog-schema.js";

export async function loadCourseCatalog(path: string): Promise<CourseCatalog> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`강좌 카탈로그 파일을 읽을 수 없습니다: ${path}`, { cause: error });
  }

  try {
    return catalogSchema.parse(JSON.parse(content));
  } catch (error) {
    throw new Error(`강좌 카탈로그 파일이 올바르지 않습니다: ${path}`, { cause: error });
  }
}
