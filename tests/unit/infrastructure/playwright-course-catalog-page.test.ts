import { describe, expect, it, vi } from "vitest";

import { PlaywrightCourseCatalogPage } from "../../../src/infrastructure/sap/playwright-course-catalog-page.js";

describe("PlaywrightCourseCatalogPage", () => {
  it("opens the configured URL and selects the academic period by stable SAP keys", async () => {
    const yearButton = { click: vi.fn().mockResolvedValue(undefined) };
    const semesterButton = { click: vi.fn().mockResolvedValue(undefined) };
    const yearOption = { click: vi.fn().mockResolvedValue(undefined) };
    const semesterOption = { click: vi.fn().mockResolvedValue(undefined) };
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn((selector: string) => {
        if (selector === "#year-button") return yearButton;
        if (selector === "#semester-button") return semesterButton;
        if (selector.includes('data-itemkey="2026"')) return yearOption;
        return semesterOption;
      }),
      screenshot: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
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
        academicYearButton: "#year-button",
        semesterButton: "#semester-button",
        optionItems: '[ct="LIB_I"]',
      },
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
        academicYearButton: "#year-button",
        semesterButton: "#semester-button",
        optionItems: '[ct="LIB_I"]',
      },
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
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn((selector: string) =>
        selector === "#year-button"
          ? yearButton
          : selector === "#semester-button"
            ? semesterButton
            : option,
      ),
      screenshot: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const catalogPage = new PlaywrightCourseCatalogPage({
      url: "https://example.com/catalog",
      headless: true,
      selectors: {
        academicYearButton: "#year-button",
        semesterButton: "#semester-button",
        optionItems: '[ct="LIB_I"]',
      },
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
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn((selector: string) =>
        selector === "#year-button"
          ? yearButton
          : selector === "#semester-button"
            ? semesterButton
            : option,
      ),
      screenshot: vi.fn().mockRejectedValue(new Error("screenshot failed")),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const catalogPage = new PlaywrightCourseCatalogPage({
      url: "https://example.com/catalog",
      headless: true,
      selectors: {
        academicYearButton: "#year-button",
        semesterButton: "#semester-button",
        optionItems: '[ct="LIB_I"]',
      },
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
});
