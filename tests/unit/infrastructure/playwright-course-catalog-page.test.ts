import { describe, expect, it, vi } from "vitest";

import { PlaywrightCourseCatalogPage } from "../../../src/infrastructure/sap/playwright-course-catalog-page.js";

describe("PlaywrightCourseCatalogPage", () => {
  it("opens the configured URL and selects the academic period", async () => {
    const yearSelect = { selectOption: vi.fn().mockResolvedValue(undefined) };
    const semesterSelect = { selectOption: vi.fn().mockResolvedValue(undefined) };
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn((selector: string) => (selector === "#year" ? yearSelect : semesterSelect)),
      screenshot: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const browserType = { launch: vi.fn().mockResolvedValue(browser) };
    const catalogPage = new PlaywrightCourseCatalogPage({
      url: "https://example.com/catalog",
      headless: true,
      selectors: { academicYear: "#year", semester: "#semester" },
      browserType,
    });

    await catalogPage.open();
    await catalogPage.selectAcademicPeriod(2026, "SECOND");
    await catalogPage.close();

    expect(browserType.launch).toHaveBeenCalledWith({ headless: true });
    expect(page.goto).toHaveBeenCalledWith("https://example.com/catalog", {
      waitUntil: "domcontentloaded",
    });
    expect(yearSelect.selectOption).toHaveBeenCalledWith({ label: "2026" });
    expect(semesterSelect.selectOption).toHaveBeenCalledWith({ label: "2nd Semester" });
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("requires open before selecting a period", async () => {
    const catalogPage = new PlaywrightCourseCatalogPage({
      url: "https://example.com/catalog",
      headless: true,
      selectors: { academicYear: "#year", semester: "#semester" },
      browserType: { launch: vi.fn() },
    });

    await expect(catalogPage.selectAcademicPeriod(2026, "SECOND")).rejects.toThrow(
      "SAP 강좌 페이지가 열리지 않았습니다.",
    );
  });
});
