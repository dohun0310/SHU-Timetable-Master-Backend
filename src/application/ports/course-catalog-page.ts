import type { Semester } from "../../domain/value-objects/semester.js";

export interface CourseCatalogPage {
  open(): Promise<void>;
  selectAcademicPeriod(academicYear: number, semester: Semester): Promise<void>;
  close(): Promise<void>;
}
