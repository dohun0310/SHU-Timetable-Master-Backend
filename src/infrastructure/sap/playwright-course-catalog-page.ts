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

interface FillLocator extends ClickLocator {
  count(): Promise<number>;
  fill(value: string): Promise<unknown>;
  press(key: string): Promise<unknown>;
}

interface BrowserPage {
  goto(url: string, options: { waitUntil: "domcontentloaded" }): Promise<unknown>;
  locator(selector: string): ClickLocator;
  screenshot(options: { path: string; fullPage: boolean }): Promise<unknown>;
  waitForFunction(
    callback: (input: { selector: string; itemKey: string }) => boolean,
    input: { selector: string; itemKey: string },
  ): Promise<unknown>;
  evaluate<Result, Argument>(
    callback: (argument: Argument) => Result,
    argument: Argument,
  ): Promise<Result>;
  waitForTimeout(milliseconds: number): Promise<unknown>;
}

interface BrowserInstance {
  newPage(): Promise<BrowserPage>;
  close(): Promise<void>;
}

interface BrowserLauncher {
  launch(options: { headless: boolean }): Promise<BrowserInstance>;
}

export interface SapPageSelectors {
  // 전역 조회 조건(대학구분·학년도·학기)에서 각 콤보가 놓인 자리.
  // SAP은 화면마다 콤보 ID를 다시 매기므로 ID를 박아 두면 로그인 화면에서 어긋난다.
  academicYearIndex: number;
  semesterIndex: number;
  optionItems: string;
  userInput: string;
  passwordInput: string;
}

export interface PlaywrightCourseCatalogPageOptions {
  url: string;
  headless: boolean;
  selectors: SapPageSelectors;
  credentials: SapCredentials;
  browserType?: BrowserLauncher;
  failureScreenshotPath?: string;
}

export interface SapCredentials {
  user: string;
  password: string;
}

export class PlaywrightCourseCatalogPage implements CourseCatalogPage {
  private readonly browserType: BrowserLauncher;
  private readonly failureScreenshotPath: string;
  private browser: BrowserInstance | null = null;
  private page: BrowserPage | null = null;
  private selectedPeriod: { academicYear: number; semester: Semester } | null = null;

  constructor(private readonly options: PlaywrightCourseCatalogPageOptions) {
    this.browserType = options.browserType ?? chromium;
    this.failureScreenshotPath =
      options.failureScreenshotPath ?? "artifacts/sap-period-selection-error.png";
  }

  async open(): Promise<void> {
    this.browser = await this.browserType.launch({ headless: this.options.headless });
    this.page = await this.browser.newPage();
    await this.openUrl();
    await this.logIn();
  }

  // 인증된 세션에서는 SAP이 세션 파라미터를 붙여 스스로 다시 이동한다.
  // 그 자체 이동이 우리의 명시적 이동을 끊으므로 실패로 보지 않는다.
  private async openUrl(): Promise<void> {
    if (!this.page) {
      throw new Error("SAP 강좌 페이지가 열리지 않았습니다.");
    }

    try {
      await this.page.goto(this.options.url, { waitUntil: "domcontentloaded" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("interrupted by another navigation")) throw error;
    }
  }

  // 개설과목 조회 화면은 SAP 로그온을 요구한다. 이미 세션이 있으면 로그온 폼이 나오지 않는다.
  private async logIn(): Promise<void> {
    if (!this.page) {
      throw new Error("SAP 강좌 페이지가 열리지 않았습니다.");
    }

    const userInput = this.page.locator(this.options.selectors.userInput) as FillLocator;
    if ((await userInput.count()) === 0) {
      return;
    }

    const passwordInput = this.page.locator(this.options.selectors.passwordInput) as FillLocator;
    await userInput.fill(this.options.credentials.user);
    await passwordInput.fill(this.options.credentials.password);
    await passwordInput.press("Enter");

    // 자격 증명이 틀리면 SAP은 같은 로그온 폼을 다시 보여준다.
    const stillOnLoginForm = await this.page
      .waitForFunction(({ selector }) => document.querySelector(selector) === null, {
        selector: this.options.selectors.userInput,
        itemKey: "",
      })
      .then(() => false)
      .catch(() => true);

    if (stillOnLoginForm) {
      throw new Error("SAP 로그인 실패: 자격 증명을 확인하세요.");
    }
  }

  async selectAcademicPeriod(academicYear: number, semester: Semester): Promise<void> {
    if (!this.page) {
      throw new Error("SAP 강좌 페이지가 열리지 않았습니다.");
    }

    try {
      await this.selectComboOption(this.options.selectors.academicYearIndex, String(academicYear));
      await this.selectComboOption(this.options.selectors.semesterIndex, sapSemesterKeys[semester]);
      this.selectedPeriod = { academicYear, semester };
    } catch (error) {
      await this.page
        .screenshot({ path: this.failureScreenshotPath, fullPage: true })
        .catch(() => undefined);
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
    return new PlaywrightSapCollectionPage(this.page as unknown as Page, async () => {
      await this.resetSelectedPeriod();
    });
  }

  private async resetSelectedPeriod(maxAttempts = 3): Promise<void> {
    if (!this.page || !this.selectedPeriod) {
      throw new Error("SAP 조회 기간이 선택되지 않았습니다.");
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.openUrl();
        await this.logIn();
        await this.selectAcademicPeriod(
          this.selectedPeriod.academicYear,
          this.selectedPeriod.semester,
        );
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`SAP 페이지 재설정 실패: ${maxAttempts}회 시도`, { cause: lastError });
  }

  private async selectComboOption(comboIndex: number, itemKey: string): Promise<void> {
    if (!this.page) {
      throw new Error("SAP 강좌 페이지가 열리지 않았습니다.");
    }

    const inputId = await this.findGlobalCombo(comboIndex);

    await this.page.locator(`#${inputId}-btn`).click();
    await this.page
      .locator(`${this.options.selectors.optionItems}[data-itemkey="${itemKey}"]`)
      .click();
    await this.page.waitForFunction(
      ({ selector, itemKey: expectedKey }) =>
        document.querySelector(selector)?.getAttribute("lsdata")?.includes(`4:'${expectedKey}'`) ??
        false,
      { selector: `#${inputId}`, itemKey },
    );
  }

  // 전역 조회 조건 콤보를 자리로 찾는다. SAP은 화면마다 콤보 ID를 다시 매기므로
  // 로그온 화면을 거치면 ID가 달라진다. 여는 버튼은 항상 입력 ID + "-btn"이다.
  private async findGlobalCombo(comboIndex: number): Promise<string> {
    if (!this.page) {
      throw new Error("SAP 강좌 페이지가 열리지 않았습니다.");
    }

    // 로그온 직후에는 조회 조건이 아직 그려지지 않을 수 있어 나타날 때까지 기다린다.
    for (let attempt = 0; attempt < comboLookupAttempts; attempt += 1) {
      const inputId = await this.page.evaluate((index) => {
        const inputs = [...document.querySelectorAll('input[ct="CB"]')].filter(
          (element) => (element as HTMLElement).offsetParent !== null,
        );
        const container = inputs[0]?.closest('[ct="ML"]');
        const globalCombos = container
          ? inputs.filter((element) => element.closest('[ct="ML"]') === container)
          : inputs;
        return globalCombos[index]?.id ?? null;
      }, comboIndex);

      if (inputId) return inputId;

      await this.page.waitForTimeout(comboLookupIntervalMs);
    }

    throw new Error(`SAP 전역 조회 조건 ${comboIndex}번 콤보를 찾을 수 없습니다.`);
  }
}

const comboLookupAttempts = 30;
const comboLookupIntervalMs = 1_000;

export const shinhanSapPageSelectors: SapPageSelectors = {
  academicYearIndex: 1,
  semesterIndex: 2,
  optionItems: '[ct="LIB_I"]',
  userInput: "#sap-user",
  passwordInput: "#sap-password",
};
