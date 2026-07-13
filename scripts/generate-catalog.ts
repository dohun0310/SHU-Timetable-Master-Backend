import { resolve } from "node:path";

import { GenerateCourseCatalog } from "../src/application/use-cases/generate-course-catalog.js";
import { PrepareCourseCatalogSession } from "../src/application/use-cases/prepare-course-catalog-session.js";
import { loadAppConfigFromDotenv } from "../src/config/app-config.js";
import { DefaultCourseIdGenerator } from "../src/domain/services/course-id-generator.js";
import { KoreanPeriodScheduleParser } from "../src/domain/services/schedule-parser.js";
import {
  formatDuration,
  formatProgress,
} from "../src/infrastructure/console/collection-progress-reporter.js";
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
  const startedAt = Date.now();

  try {
    console.log(`${config.targetAcademicYear}학년도 ${config.targetSemester} 강좌 수집 시작`);
    await prepareSession.execute({
      academicYear: config.targetAcademicYear,
      semester: config.targetSemester,
    });

    const collector = new ShinhanSapCourseCollector(page.getCollectionPage(), (progress) => {
      console.log(formatProgress(progress));
    });
    const rawCourses = await collector.collect();

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

    console.log(
      `수집 완료: ${catalog.meta.courseCount}건 (${formatDuration(Date.now() - startedAt)})`,
    );
    console.log(`강좌 카탈로그 생성 완료: ${outputPath}`);
  } finally {
    await page.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
