import type { CourseCatalogPage } from "../ports/course-catalog-page.js";
import type { Semester } from "../../domain/value-objects/semester.js";

export interface PrepareCourseCatalogSessionInput {
  academicYear: number;
  semester: Semester;
}

export class PrepareCourseCatalogSession {
  constructor(private readonly page: CourseCatalogPage) {}

  async execute(input: PrepareCourseCatalogSessionInput): Promise<void> {
    try {
      await this.page.open();
      await this.page.selectAcademicPeriod(input.academicYear, input.semester);
    } catch (error) {
      await this.page.close();
      throw error;
    }
  }
}
