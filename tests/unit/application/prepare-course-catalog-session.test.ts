import { describe, expect, it, vi } from "vitest";

import { PrepareCourseCatalogSession } from "../../../src/application/use-cases/prepare-course-catalog-session.js";
import type { CourseCatalogPage } from "../../../src/application/ports/course-catalog-page.js";

describe("PrepareCourseCatalogSession", () => {
  it("opens the catalog and selects the configured academic period", async () => {
    const page: CourseCatalogPage = {
      open: vi.fn().mockResolvedValue(undefined),
      selectAcademicPeriod: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new PrepareCourseCatalogSession(page);

    await useCase.execute({ academicYear: 2026, semester: "SECOND" });

    expect(page.open).toHaveBeenCalledOnce();
    expect(page.selectAcademicPeriod).toHaveBeenCalledWith(2026, "SECOND");
  });

  it("closes the page when period selection fails", async () => {
    const failure = new Error("학기 선택 실패");
    const page: CourseCatalogPage = {
      open: vi.fn().mockResolvedValue(undefined),
      selectAcademicPeriod: vi.fn().mockRejectedValue(failure),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new PrepareCourseCatalogSession(page);

    await expect(useCase.execute({ academicYear: 2026, semester: "SECOND" })).rejects.toThrow(
      failure,
    );
    expect(page.close).toHaveBeenCalledOnce();
  });
});
