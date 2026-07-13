import type {
  CollectionProgress,
  CollectionProgressListener,
} from "../../application/ports/collection-progress.js";
import type { CourseSource, RawCourse } from "../../application/ports/course-source.js";
import type { CourseCategory } from "../../domain/schemas/catalog-schema.js";
import type { SapCollectionPage, SapFilterOption } from "./sap-collection-page.js";
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

// 수집 순서. 진행 보고의 [n/6]은 이 순서를 따른다.
const phaseCount = 6;

export class ShinhanSapCourseCollector implements CourseSource {
  private readonly parser = new SapCourseRowParser();
  private step = "시작";

  constructor(
    private readonly page: SapCollectionPage,
    private readonly onProgress: CollectionProgressListener = () => {},
  ) {}

  async collect(): Promise<RawCourse[]> {
    const courses: RawCourse[] = [];

    try {
      await this.runPhase(tabs.basic, 1, courses, async () => {
        await this.page.selectTab(tabs.basic.index);
        await this.searchAndAppend(tabs.basic, courses, 10_000);
      });

      await this.runPhase(tabs.coreByArea, 2, courses, () => this.collectCoreAreas(courses));

      await this.runPhase(tabs.core, 3, courses, () =>
        this.collectCurrentSelection(tabs.core, courses),
      );

      await this.runPhase(tabs.teaching, 4, courses, () =>
        this.collectCurrentSelection(tabs.teaching, courses),
      );

      await this.page.reset();
      await this.runPhase(tabs.microDegree, 5, courses, () => this.collectMicroDegrees(courses));

      await this.page.reset();
      await this.runPhase(tabs.department, 6, courses, () => this.collectDepartments(courses));
    } catch (error) {
      throw new Error(`강좌 수집 실패 (${this.step})`, { cause: error });
    }

    return this.deduplicate(courses);
  }

  // 실패했을 때 어느 탭·학과에서 멈췄는지 알 수 있도록, 탭이 낸 강좌 수와 함께 단계를 기록한다.
  private async runPhase(
    tab: TabDefinition,
    index: number,
    courses: RawCourse[],
    collect: () => Promise<void>,
  ): Promise<void> {
    this.step = tab.label;
    this.report({ type: "PHASE_STARTED", label: tab.label, index, total: phaseCount });

    const before = courses.length;
    await collect();

    this.report({
      type: "PHASE_FINISHED",
      label: tab.label,
      courses: courses.length - before,
    });
  }

  private async collectCoreAreas(target: RawCourse[]): Promise<void> {
    await this.page.selectTab(tabs.coreByArea.index);
    const areas = await this.page.listFilterOptions(0);

    for (const [index, area] of areas.entries()) {
      this.step = `${tabs.coreByArea.label} > ${area.label}`;
      const before = target.length;

      await this.page.selectFilterOption(0, area.key);
      await this.searchAndAppend(tabs.coreByArea, target);

      this.reportUnit(area, index, areas.length, target.length - before);
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

      for (const [index, department] of orderedDepartments.entries()) {
        this.step = `${tabs.department.label} > ${college.label} > ${department.label}`;
        const before = target.length;

        await this.page.reset();
        await this.page.selectTab(tabs.department.index);
        await this.page.selectFilterOption(0, college.key);
        await this.page.listFilterOptions(1);
        await this.page.selectFilterOption(1, department.key);
        await this.searchAndAppend(tabs.department, target);

        this.reportUnit(department, index, orderedDepartments.length, target.length - before);
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

      for (const [index, program] of programs.entries()) {
        this.step = `${tabs.microDegree.label} > ${program.label}`;
        const before = target.length;

        await this.page.reset();
        await this.page.selectTab(tabs.microDegree.index);
        await this.page.selectFilterOption(0, type.key);
        await this.page.listFilterOptions(1);
        await this.page.selectFilterOption(1, program.key);
        await this.searchAndAppend(tabs.microDegree, target);

        this.reportUnit(program, index, programs.length, target.length - before);
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

  private reportUnit(option: SapFilterOption, index: number, total: number, courses: number): void {
    this.report({ type: "UNIT_COLLECTED", label: option.label, index: index + 1, total, courses });
  }

  private report(progress: CollectionProgress): void {
    this.onProgress(progress);
  }

  private currentOptionLast(options: readonly SapFilterOption[]) {
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
