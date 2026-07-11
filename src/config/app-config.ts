import { config as loadDotenv } from "dotenv";
import { z } from "zod";

import { parseSemester, type Semester } from "../domain/value-objects/semester.js";

export interface AppConfig {
  targetAcademicYear: number;
  targetSemester: Semester;
  sapCourseUrl: string;
  port: number;
  playwrightHeadless: boolean;
}

const integerText = /^\d+$/;

function parseAcademicYear(value: string | undefined): number {
  if (!value || !integerText.test(value)) {
    throw new Error("TARGET_ACADEMIC_YEAR는 2000 이상의 정수여야 합니다.");
  }

  const academicYear = Number(value);
  if (!Number.isSafeInteger(academicYear) || academicYear < 2000) {
    throw new Error("TARGET_ACADEMIC_YEAR는 2000 이상의 정수여야 합니다.");
  }

  return academicYear;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT는 1부터 65535 사이의 정수여야 합니다.");
  }
  return port;
}

export function loadAppConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const sapCourseUrl = z.url().parse(environment.SAP_COURSE_URL);

  return {
    targetAcademicYear: parseAcademicYear(environment.TARGET_ACADEMIC_YEAR),
    targetSemester: parseSemester(environment.TARGET_SEMESTER ?? ""),
    sapCourseUrl,
    port: parsePort(environment.PORT),
    playwrightHeadless: environment.PLAYWRIGHT_HEADLESS !== "false",
  };
}

export function loadAppConfigFromDotenv(): AppConfig {
  loadDotenv();
  return loadAppConfig();
}
