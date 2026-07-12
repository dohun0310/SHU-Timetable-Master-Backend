import { resolve } from "node:path";

import { loadServerConfigFromDotenv } from "../config/app-config.js";
import { loadCourseCatalog } from "../infrastructure/json/load-course-catalog.js";
import { createApp } from "./app.js";

async function main(): Promise<void> {
  const config = loadServerConfigFromDotenv();
  const catalogPath = resolve(config.catalogPath);
  const catalog = await loadCourseCatalog(catalogPath);
  const app = createApp({ catalog, corsOrigin: config.corsOrigin });
  app.listen(config.port, () => {
    console.log(
      `강좌 API 서버 시작: http://localhost:${config.port} (${catalog.meta.courseCount}개)`,
    );
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
