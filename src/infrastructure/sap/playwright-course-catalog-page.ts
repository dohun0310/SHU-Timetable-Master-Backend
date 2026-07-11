import { chromium, type Page } from "playwright";

import type { CourseCatalogPage } from "../../application/ports/course-catalog-page.js";
import {
  sapSemesterKeys,
  sapSemesterLabels,
  type Semester,
} from "../../domain/value-objects/semester.js";
import { PlaywrightSapCollectionPage } from "./playwright-sap-collection-page.js";
import type { SapCollectionPage } from "./sap-collection-page.js";

interface ClickLocator {
  click(): Promise<unknown>;
}

interface BrowserPage {
  goto(url: string, options: { waitUntil: "domcontentloaded" }): Promise<unknown>;
  locator(selector: string): ClickLocator;
  screenshot(options: { path: string; fullPage: boolean }): Promise<unknown>;
  waitForFunction(
    callback: (input: { selector: string; itemKey: string }) => boolean,
    input: { selector: string; itemKey: string },
  ): Promise<unknown>;
}

interface BrowserInstance {
  newPage(): Promise<BrowserPage>;
  close(): Promise<void>;
}

interface BrowserLauncher {
  launch(options: { headless: boolean }): Promise<BrowserInstance>;
}

export interface SapPageSelectors {
  academicYearButton: string;
  semesterButton: string;
  optionItems: string;
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
      await this.selectComboOption(this.options.selectors.academicYearButton, String(academicYear));
      await this.selectComboOption(
        this.options.selectors.semesterButton,
        sapSemesterKeys[semester],
      );
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

  getCollectionPage(): SapCollectionPage {
    if (!this.page) {
      throw new Error("SAP 강좌 페이지가 열리지 않았습니다.");
    }
    return new PlaywrightSapCollectionPage(this.page as unknown as Page);
  }

  private async selectComboOption(buttonSelector: string, itemKey: string): Promise<void> {
    if (!this.page) {
      throw new Error("SAP 강좌 페이지가 열리지 않았습니다.");
    }

    await this.page.locator(buttonSelector).click();
    await this.page
      .locator(`${this.options.selectors.optionItems}[data-itemkey="${itemKey}"]`)
      .click();
    const inputSelector = buttonSelector.replace(/-btn$/, "");
    await this.page.waitForFunction(
      ({ selector, itemKey: expectedKey }) =>
        document.querySelector(selector)?.getAttribute("lsdata")?.includes(`4:'${expectedKey}'`) ??
        false,
      { selector: inputSelector, itemKey },
    );
  }
}

export const shinhanSapPageSelectors: SapPageSelectors = {
  academicYearButton: "#WD25-btn",
  semesterButton: "#WD76-btn",
  optionItems: '[ct="LIB_I"]',
};
