import { resolve } from "node:path";

import { GenerateCourseCatalog } from "../src/application/use-cases/generate-course-catalog.js";
import { PrepareCourseCatalogSession } from "../src/application/use-cases/prepare-course-catalog-session.js";
import { loadAppConfigFromDotenv } from "../src/config/app-config.js";
import { DefaultCourseIdGenerator } from "../src/domain/services/course-id-generator.js";
import { KoreanPeriodScheduleParser } from "../src/domain/services/schedule-parser.js";
import { JsonFileCourseCatalogRepository } from "../src/infrastructure/json/json-file-course-catalog-repository.js";
import {
  PlaywrightCourseCatalogPage,
  shinhanSapPageSelectors,
} from "../src/infrastructure/sap/playwright-course-catalog-page.js";
import { ShinhanSapCourseCollector } from "../src/infrastructure/sap/shinhan-sap-course-collector.js";

async function main(): Promise<void> {
  const config = loadAppConfigFromDotenv();
  const page = new PlaywrightCourseCatalogPage({
    url: config.sapCourseUrl,
    headless: config.playwrightHeadless,
    selectors: shinhanSapPageSelectors,
  });
  const prepareSession = new PrepareCourseCatalogSession(page);

  try {
    await prepareSession.execute({
      academicYear: config.targetAcademicYear,
      semester: config.targetSemester,
    });
    const rawCourses = await new ShinhanSapCourseCollector(page.getCollectionPage()).collect();
    const catalog = new GenerateCourseCatalog({
      idGenerator: new DefaultCourseIdGenerator(),
      scheduleParser: new KoreanPeriodScheduleParser(),
    }).execute({
      academicYear: config.targetAcademicYear,
      semester: config.targetSemester,
      sourceUrl: config.sapCourseUrl,
      rawCourses,
    });
    const outputPath = resolve("generated/catalog.json");
    await new JsonFileCourseCatalogRepository(outputPath).save(catalog);
    console.log(`강좌 카탈로그 생성 완료: ${outputPath} (${catalog.meta.courseCount}개)`);
  } finally {
    await page.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
