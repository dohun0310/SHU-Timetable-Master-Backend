import { describe, expect, it, vi } from "vitest";

import { PlaywrightCourseCatalogPage } from "../../../src/infrastructure/sap/playwright-course-catalog-page.js";

// 전역 조회 조건 콤보 탐색은 페이지 안에서 이뤄진다. 자리 번호로 ID를 돌려주는 목으로 대신한다.
function comboLookup() {
  return vi.fn(async (_callback: unknown, index: number) => (index === 0 ? "year" : "semester"));
}

// 세션이 이미 있으면 SAP은 로그온 폼을 그리지 않는다.
function loggedInLocator() {
  return {
    count: vi.fn().mockResolvedValue(0),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    press: vi.fn().mockResolvedValue(undefined),
  };
}

describe("PlaywrightCourseCatalogPage", () => {
  it("opens the configured URL and selects the academic period by stable SAP keys", async () => {
    const yearButton = { click: vi.fn().mockResolvedValue(undefined) };
    const semesterButton = { click: vi.fn().mockResolvedValue(undefined) };
    const yearOption = { click: vi.fn().mockResolvedValue(undefined) };
    const semesterOption = { click: vi.fn().mockResolvedValue(undefined) };
    const loggedInInput = loggedInLocator();
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn((selector: string) => {
        if (selector === "#sap-user" || selector === "#sap-password") return loggedInInput;
        if (selector === "#year-btn") return yearButton;
        if (selector === "#semester-btn") return semesterButton;
        if (selector.includes('data-itemkey="2026"')) return yearOption;
        return semesterOption;
      }),
      screenshot: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: comboLookup(),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const browserType = { launch: vi.fn().mockResolvedValue(browser) };
    const catalogPage = new PlaywrightCourseCatalogPage({
      url: "https://example.com/catalog",
      headless: true,
      selectors: {
        academicYearIndex: 0,
        semesterIndex: 1,
        optionItems: '[ct="LIB_I"]',
        userInput: "#sap-user",
        passwordInput: "#sap-password",
      },
      credentials: { user: "collector", password: "secret" },
      browserType,
    });

    await catalogPage.open();
    await catalogPage.selectAcademicPeriod(2026, "SECOND");
    await catalogPage.close();

    expect(browserType.launch).toHaveBeenCalledWith({ headless: true });
    expect(page.goto).toHaveBeenCalledWith("https://example.com/catalog", {
      waitUntil: "domcontentloaded",
    });
    expect(yearButton.click).toHaveBeenCalledOnce();
    expect(semesterButton.click).toHaveBeenCalledOnce();
    expect(yearOption.click).toHaveBeenCalledOnce();
    expect(semesterOption.click).toHaveBeenCalledOnce();
    expect(page.locator).toHaveBeenCalledWith('[ct="LIB_I"][data-itemkey="2026"]');
    expect(page.locator).toHaveBeenCalledWith('[ct="LIB_I"][data-itemkey="210"]');
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("requires open before selecting a period", async () => {
    const catalogPage = new PlaywrightCourseCatalogPage({
      url: "https://example.com/catalog",
      headless: true,
      selectors: {
        academicYearIndex: 0,
        semesterIndex: 1,
        optionItems: '[ct="LIB_I"]',
        userInput: "#sap-user",
        passwordInput: "#sap-password",
      },
      credentials: { user: "collector", password: "secret" },
      browserType: { launch: vi.fn() },
    });

    await expect(catalogPage.selectAcademicPeriod(2026, "SECOND")).rejects.toThrow(
      "SAP 강좌 페이지가 열리지 않았습니다.",
    );
  });

  it("retries page reset when the academic period selector is temporarily unavailable", async () => {
    const yearButton = {
      click: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("temporary timeout"))
        .mockResolvedValue(undefined),
    };
    const semesterButton = { click: vi.fn().mockResolvedValue(undefined) };
    const option = { click: vi.fn().mockResolvedValue(undefined) };
    const loggedInInput = loggedInLocator();
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn((selector: string) =>
        selector === "#sap-user" || selector === "#sap-password"
          ? loggedInInput
          : selector === "#year-btn"
            ? yearButton
            : selector === "#semester-btn"
              ? semesterButton
              : option,
      ),
      screenshot: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: comboLookup(),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const catalogPage = new PlaywrightCourseCatalogPage({
      url: "https://example.com/catalog",
      headless: true,
      selectors: {
        academicYearIndex: 0,
        semesterIndex: 1,
        optionItems: '[ct="LIB_I"]',
        userInput: "#sap-user",
        passwordInput: "#sap-password",
      },
      credentials: { user: "collector", password: "secret" },
      browserType: { launch: vi.fn().mockResolvedValue(browser) },
    });

    await catalogPage.open();
    await catalogPage.selectAcademicPeriod(2026, "SECOND");
    await catalogPage.getCollectionPage().reset();

    expect(page.goto).toHaveBeenCalledTimes(3);
    expect(yearButton.click).toHaveBeenCalledTimes(3);
    expect(page.screenshot).toHaveBeenCalledOnce();
  });

  it("reports the retry count when page reset keeps failing", async () => {
    const yearButton = {
      click: vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error("timeout")),
    };
    const semesterButton = { click: vi.fn().mockResolvedValue(undefined) };
    const option = { click: vi.fn().mockResolvedValue(undefined) };
    const loggedInInput = loggedInLocator();
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn((selector: string) =>
        selector === "#sap-user" || selector === "#sap-password"
          ? loggedInInput
          : selector === "#year-btn"
            ? yearButton
            : selector === "#semester-btn"
              ? semesterButton
              : option,
      ),
      screenshot: vi.fn().mockRejectedValue(new Error("screenshot failed")),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: comboLookup(),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const catalogPage = new PlaywrightCourseCatalogPage({
      url: "https://example.com/catalog",
      headless: true,
      selectors: {
        academicYearIndex: 0,
        semesterIndex: 1,
        optionItems: '[ct="LIB_I"]',
        userInput: "#sap-user",
        passwordInput: "#sap-password",
      },
      credentials: { user: "collector", password: "secret" },
      browserType: { launch: vi.fn().mockResolvedValue(browser) },
    });

    await catalogPage.open();
    await catalogPage.selectAcademicPeriod(2026, "SECOND");

    await expect(catalogPage.getCollectionPage().reset()).rejects.toThrow(
      "SAP 페이지 재설정 실패: 3회 시도",
    );
    expect(page.goto).toHaveBeenCalledTimes(4);
    expect(page.screenshot).toHaveBeenCalledTimes(3);
  });

  it("submits the logon form when SAP asks for credentials", async () => {
    const userInput = {
      count: vi.fn().mockResolvedValue(1),
      click: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
    };
    const passwordInput = {
      count: vi.fn().mockResolvedValue(1),
      click: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
    };
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn((selector: string) => (selector === "#sap-user" ? userInput : passwordInput)),
      screenshot: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: comboLookup(),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const catalogPage = new PlaywrightCourseCatalogPage({
      url: "https://example.com/catalog",
      headless: true,
      selectors: {
        academicYearIndex: 0,
        semesterIndex: 1,
        optionItems: '[ct="LIB_I"]',
        userInput: "#sap-user",
        passwordInput: "#sap-password",
      },
      credentials: { user: "collector", password: "secret" },
      browserType: { launch: vi.fn().mockResolvedValue(browser) },
    });

    await catalogPage.open();

    expect(userInput.fill).toHaveBeenCalledWith("collector");
    expect(passwordInput.fill).toHaveBeenCalledWith("secret");
    expect(passwordInput.press).toHaveBeenCalledWith("Enter");
  });

  it("reports a login failure when the logon form stays on screen", async () => {
    const credentialInput = {
      count: vi.fn().mockResolvedValue(1),
      click: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
    };
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn(() => credentialInput),
      screenshot: vi.fn().mockResolvedValue(undefined),
      // 잘못된 자격 증명이면 로그온 폼이 사라지지 않아 대기가 실패한다.
      waitForFunction: vi.fn().mockRejectedValue(new Error("timeout")),
      evaluate: comboLookup(),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const catalogPage = new PlaywrightCourseCatalogPage({
      url: "https://example.com/catalog",
      headless: true,
      selectors: {
        academicYearIndex: 0,
        semesterIndex: 1,
        optionItems: '[ct="LIB_I"]',
        userInput: "#sap-user",
        passwordInput: "#sap-password",
      },
      credentials: { user: "collector", password: "wrong" },
      browserType: { launch: vi.fn().mockResolvedValue(browser) },
    });

    await expect(catalogPage.open()).rejects.toThrow("SAP 로그인 실패: 자격 증명을 확인하세요.");
  });

  it("keeps going when SAP redirects the page to itself", async () => {
    const loggedInInput = loggedInLocator();
    const page = {
      // 인증된 세션에서는 SAP이 스스로 다시 이동해 우리의 이동을 끊는다.
      goto: vi
        .fn()
        .mockRejectedValue(
          new Error('page.goto: Navigation to "https://sap" is interrupted by another navigation'),
        ),
      locator: vi.fn(() => loggedInInput),
      screenshot: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: comboLookup(),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const catalogPage = new PlaywrightCourseCatalogPage({
      url: "https://example.com/catalog",
      headless: true,
      selectors: {
        academicYearIndex: 0,
        semesterIndex: 1,
        optionItems: '[ct="LIB_I"]',
        userInput: "#sap-user",
        passwordInput: "#sap-password",
      },
      credentials: { user: "collector", password: "secret" },
      browserType: { launch: vi.fn().mockResolvedValue(browser) },
    });

    await expect(catalogPage.open()).resolves.toBeUndefined();
  });

  it("still reports a navigation error that is not a SAP self-redirect", async () => {
    const page = {
      goto: vi.fn().mockRejectedValue(new Error("page.goto: net::ERR_CONNECTION_REFUSED")),
      locator: vi.fn(() => loggedInLocator()),
      screenshot: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: comboLookup(),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const catalogPage = new PlaywrightCourseCatalogPage({
      url: "https://example.com/catalog",
      headless: true,
      selectors: {
        academicYearIndex: 0,
        semesterIndex: 1,
        optionItems: '[ct="LIB_I"]',
        userInput: "#sap-user",
        passwordInput: "#sap-password",
      },
      credentials: { user: "collector", password: "secret" },
      browserType: { launch: vi.fn().mockResolvedValue(browser) },
    });

    await expect(catalogPage.open()).rejects.toThrow("net::ERR_CONNECTION_REFUSED");
  });
});
