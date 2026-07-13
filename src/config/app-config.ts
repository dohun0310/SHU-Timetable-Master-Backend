import { config as loadDotenv } from "dotenv";
import { z } from "zod";

import { parseSemester, type Semester } from "../domain/value-objects/semester.js";

export interface AppConfig {
  targetAcademicYear: number;
  targetSemester: Semester;
  sapCourseUrl: string;
  port: number;
  playwrightHeadless: boolean;
  catalogPath: string;
  corsOrigin: string;
  sapConcurrency: number;
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

// 학과를 여러 페이지로 나눠 수집한다. 학교 서버에 부담을 주지 않도록 상한을 둔다.
function parseSapConcurrency(value: string | undefined): number {
  const concurrency = Number(value ?? "4");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("SAP_CONCURRENCY는 1부터 8 사이의 정수여야 합니다.");
  }
  return concurrency;
}

export interface ServerConfig {
  port: number;
  catalogPath: string;
  corsOrigin: string;
}

export function loadServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: parsePort(environment.PORT),
    catalogPath: environment.CATALOG_PATH ?? "generated/catalog.json",
    corsOrigin: environment.CORS_ORIGIN ?? "*",
  };
}

export function loadAppConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const sapCourseUrl = z.url().parse(environment.SAP_COURSE_URL);

  return {
    targetAcademicYear: parseAcademicYear(environment.TARGET_ACADEMIC_YEAR),
    targetSemester: parseSemester(environment.TARGET_SEMESTER ?? ""),
    sapCourseUrl,
    port: parsePort(environment.PORT),
    playwrightHeadless: environment.PLAYWRIGHT_HEADLESS !== "false",
    sapConcurrency: parseSapConcurrency(environment.SAP_CONCURRENCY),
    catalogPath: environment.CATALOG_PATH ?? "generated/catalog.json",
    corsOrigin: environment.CORS_ORIGIN ?? "*",
  };
}

export function loadServerConfigFromDotenv(): ServerConfig {
  loadDotenv();
  return loadServerConfig();
}

export function loadAppConfigFromDotenv(): AppConfig {
  loadDotenv();
  return loadAppConfig();
}
