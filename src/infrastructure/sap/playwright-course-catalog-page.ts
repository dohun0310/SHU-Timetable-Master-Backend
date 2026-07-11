import { chromium } from "playwright";

import type { CourseCatalogPage } from "../../application/ports/course-catalog-page.js";
import { sapSemesterLabels, type Semester } from "../../domain/value-objects/semester.js";

interface SelectLocator {
  selectOption(options: { label: string }): Promise<unknown>;
}

interface BrowserPage {
  goto(url: string, options: { waitUntil: "domcontentloaded" }): Promise<unknown>;
  locator(selector: string): SelectLocator;
  screenshot(options: { path: string; fullPage: boolean }): Promise<unknown>;
}

interface BrowserInstance {
  newPage(): Promise<BrowserPage>;
  close(): Promise<void>;
}

interface BrowserLauncher {
  launch(options: { headless: boolean }): Promise<BrowserInstance>;
}

export interface SapPageSelectors {
  academicYear: string;
  semester: string;
}

export interface PlaywrightCourseCatalogPageOptions {
  url: string;
  headless: boolean;
  selectors: SapPageSelectors;
  browserType?: BrowserLauncher;
  failureScreenshotPath?: string;
}

export class PlaywrightCourseCatalogPage implements CourseCatalogPage {
  private readonly browserType: BrowserLauncher;
  private readonly failureScreenshotPath: string;
  private browser: BrowserInstance | null = null;
  private page: BrowserPage | null = null;

  constructor(private readonly options: PlaywrightCourseCatalogPageOptions) {
    this.browserType = options.browserType ?? chromium;
    this.failureScreenshotPath =
      options.failureScreenshotPath ?? "artifacts/sap-period-selection-error.png";
  }

  async open(): Promise<void> {
    this.browser = await this.browserType.launch({ headless: this.options.headless });
    this.page = await this.browser.newPage();
    await this.page.goto(this.options.url, { waitUntil: "domcontentloaded" });
  }

  async selectAcademicPeriod(academicYear: number, semester: Semester): Promise<void> {
    if (!this.page) {
      throw new Error("SAP 강좌 페이지가 열리지 않았습니다.");
    }

    try {
      await this.page
        .locator(this.options.selectors.academicYear)
        .selectOption({ label: String(academicYear) });
      await this.page
        .locator(this.options.selectors.semester)
        .selectOption({ label: sapSemesterLabels[semester] });
    } catch (error) {
      await this.page.screenshot({ path: this.failureScreenshotPath, fullPage: true });
      throw new Error(`SAP 조회 기간 선택 실패: ${academicYear} ${sapSemesterLabels[semester]}`, {
        cause: error,
      });
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.page = null;
    this.browser = null;
  }
}
