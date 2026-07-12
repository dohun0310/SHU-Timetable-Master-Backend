import type { CourseSource, RawCourse } from "../../application/ports/course-source.js";
import type { CourseCategory } from "../../domain/schemas/catalog-schema.js";
import type { SapCollectionPage } from "./sap-collection-page.js";
import { SapCourseRowParser } from "./sap-course-row-parser.js";

interface TabDefinition {
  index: number;
  label: string;
  category: CourseCategory;
}

const tabs = {
  basic: { index: 0, label: "기초교양", category: "BASIC_LIBERAL_ARTS" },
  coreByArea: { index: 1, label: "핵심교양(영역별)", category: "CORE_LIBERAL_ARTS" },
  core: { index: 2, label: "핵심교양", category: "CORE_LIBERAL_ARTS" },
  microDegree: { index: 3, label: "마이크로디그리", category: "MICRO_DEGREE" },
  department: { index: 4, label: "학과/전공", category: "MAJOR" },
  teaching: { index: 5, label: "교직", category: "TEACHING" },
} as const satisfies Record<string, TabDefinition>;

export class ShinhanSapCourseCollector implements CourseSource {
  private readonly parser = new SapCourseRowParser();

  constructor(private readonly page: SapCollectionPage) {}

  async collect(): Promise<RawCourse[]> {
    const courses: RawCourse[] = [];

    await this.page.selectTab(tabs.basic.index);
    await this.searchAndAppend(tabs.basic, courses, 10_000);
    await this.collectCoreAreas(courses);
    await this.collectCurrentSelection(tabs.core, courses);
    await this.collectCurrentSelection(tabs.teaching, courses);
    await this.page.reset();
    await this.collectMicroDegrees(courses);
    await this.page.reset();
    await this.collectDepartments(courses);

    return this.deduplicate(courses);
  }

  private async collectCoreAreas(target: RawCourse[]): Promise<void> {
    await this.page.selectTab(tabs.coreByArea.index);
    const areas = await this.page.listFilterOptions(0);

    for (const area of areas) {
      await this.page.selectFilterOption(0, area.key);
      await this.searchAndAppend(tabs.coreByArea, target);
    }
  }

  private async collectDepartments(target: RawCourse[]): Promise<void> {
    await this.page.selectTab(tabs.department.index);
    const colleges = await this.page.listFilterOptions(0);

    for (const college of colleges) {
      await this.page.reset();
      await this.page.selectTab(tabs.department.index);
      await this.page.selectFilterOption(0, college.key);
      const departments = await this.page.listFilterOptions(1);
      const orderedDepartments =
        departments.length > 1 ? [...departments.slice(1), departments[0]!] : departments;

      for (const department of orderedDepartments) {
        await this.page.selectFilterOption(1, department.key);
        await this.searchAndAppend(tabs.department, target);
      }
    }
  }

  private async collectMicroDegrees(target: RawCourse[]): Promise<void> {
    await this.page.selectTab(tabs.microDegree.index);
    const availableTypes = await this.page.listFilterOptions(0);
    const allType = availableTypes.find((option) => option.key === "" || option.label === "전체");
    const types = allType ? [allType] : this.currentOptionLast(availableTypes);

    for (const type of types) {
      await this.page.selectFilterOption(0, type.key);
      const availablePrograms = await this.page.listFilterOptions(1);
      const concretePrograms = availablePrograms.filter(
        (option) => option.key !== "00000000" && option.label !== "전체",
      );
      const programs = this.currentOptionLast(
        concretePrograms.length > 0 ? concretePrograms : availablePrograms,
      );
      for (const program of programs) {
        await this.page.selectFilterOption(1, program.key);
        await this.searchAndAppend(tabs.microDegree, target);
      }
    }
  }

  private async collectCurrentSelection(tab: TabDefinition, target: RawCourse[]): Promise<void> {
    await this.page.selectTab(tab.index);
    this.appendRows(tab, target, await this.page.readRows());
  }

  private async searchAndAppend(
    tab: TabDefinition,
    target: RawCourse[],
    timeoutMs?: number,
  ): Promise<void> {
    const completed = await this.page.search(timeoutMs);
    if (!completed) return;
    this.appendRows(tab, target, await this.page.readRows());
  }

  private appendRows(tab: TabDefinition, target: RawCourse[], rows: string[][]): void {
    for (const row of rows) {
      target.push(this.parser.parse(row, { tab: tab.label, category: tab.category }));
    }
  }

  private currentOptionLast(options: readonly { key: string; label: string }[]) {
    return options.length > 1 ? [...options.slice(1), options[0]!] : [...options];
  }

  private deduplicate(courses: RawCourse[]): RawCourse[] {
    const unique = new Map<string, RawCourse>();
    for (const course of courses) {
      const key = [course.courseCode, course.classNumber, course.departmentName ?? ""].join("|");
      if (!unique.has(key)) unique.set(key, course);
    }
    return [...unique.values()];
  }
}
