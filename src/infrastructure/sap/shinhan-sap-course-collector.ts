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

const phaseCount = 6;

// 어느 탭·학과에서 멈췄는지 담는다. 안쪽에서 붙인 맥락이 가장 구체적이므로 바깥에서 덮어쓰지 않는다.
class CollectionFailure extends Error {
  constructor(step: string, cause: unknown) {
    super(`강좌 수집 실패 (${step})`, { cause });
    this.name = "CollectionFailure";
  }
}

// 한 단과대학 안의 한 학과. 학과 순회는 이 단위로 페이지에 나눠 맡긴다.
interface DepartmentJob {
  college: SapFilterOption;
  department: SapFilterOption;
}

interface ProgramJob {
  type: SapFilterOption;
  program: SapFilterOption;
}

export class ShinhanSapCourseCollector implements CourseSource {
  private readonly parser = new SapCourseRowParser();
  private readonly pages: SapCollectionPage[];

  constructor(
    pages: SapCollectionPage | SapCollectionPage[],
    private readonly onProgress: CollectionProgressListener = () => {},
  ) {
    this.pages = Array.isArray(pages) ? pages : [pages];
    if (this.pages.length === 0) throw new Error("수집 페이지가 최소 하나는 필요합니다.");
  }

  // 탭 순회처럼 순서를 지켜야 하는 일은 항상 첫 페이지에서 한다.
  private get page(): SapCollectionPage {
    return this.pages[0]!;
  }

  async collect(): Promise<RawCourse[]> {
    const courses: RawCourse[] = [];

    await this.runPhase(tabs.basic, 1, courses, async () => {
      await this.page.selectTab(tabs.basic.index);
      await this.searchAndAppend(this.page, tabs.basic, courses, 10_000);
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

    return this.deduplicate(courses);
  }

  private async runPhase(
    tab: TabDefinition,
    index: number,
    courses: RawCourse[],
    collect: () => Promise<void>,
  ): Promise<void> {
    this.report({ type: "PHASE_STARTED", label: tab.label, index, total: phaseCount });

    const before = courses.length;
    await this.step(tab.label, collect);

    this.report({ type: "PHASE_FINISHED", label: tab.label, courses: courses.length - before });
  }

  private async step<T>(label: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof CollectionFailure) throw error;
      throw new CollectionFailure(label, error);
    }
  }

  private async collectCoreAreas(target: RawCourse[]): Promise<void> {
    await this.page.selectTab(tabs.coreByArea.index);
    const areas = await this.page.listFilterOptions(0);

    for (const [index, area] of areas.entries()) {
      const collected = await this.step(`${tabs.coreByArea.label} > ${area.label}`, async () => {
        const rows: RawCourse[] = [];
        await this.page.selectFilterOption(0, area.key);
        await this.searchAndAppend(this.page, tabs.coreByArea, rows);
        return rows;
      });

      target.push(...collected);
      this.reportUnit(area, index, areas.length, collected.length);
    }
  }

  // 학과 순회가 수집 시간의 대부분을 차지한다. 학과마다 페이지를 통째로 다시 로드해야 하고
  // (재로드를 빼면 SAP이 두 번째 검색부터 응답하지 않는다) 학과 옵션이 289개나 되기 때문이다.
  // 학과별 절차는 그대로 두고 여러 페이지에 나눠 맡겨 시간을 줄인다.
  private async collectDepartments(target: RawCourse[]): Promise<void> {
    await this.page.selectTab(tabs.department.index);
    const colleges = await this.page.listFilterOptions(0);

    const jobs: DepartmentJob[] = [];
    for (const college of colleges) {
      await this.page.reset();
      await this.page.selectTab(tabs.department.index);
      await this.page.selectFilterOption(0, college.key);
      const departments = await this.page.listFilterOptions(1);
      const ordered =
        departments.length > 1 ? [...departments.slice(1), departments[0]!] : departments;

      for (const department of ordered) jobs.push({ college, department });
    }

    const collected = await this.runInParallel(
      jobs,
      (page, job) =>
        this.step(
          `${tabs.department.label} > ${job.college.label} > ${job.department.label}`,
          async () => {
            const rows: RawCourse[] = [];
            await page.reset();
            await page.selectTab(tabs.department.index);
            await page.selectFilterOption(0, job.college.key);
            await page.listFilterOptions(1);
            await page.selectFilterOption(1, job.department.key);
            await this.searchAndAppend(page, tabs.department, rows);
            return rows;
          },
        ),
      (job, rows, finished, total) =>
        this.reportUnit(job.department, finished - 1, total, rows.length),
    );

    for (const rows of collected) target.push(...rows);
  }

  private async collectMicroDegrees(target: RawCourse[]): Promise<void> {
    await this.page.selectTab(tabs.microDegree.index);
    const availableTypes = await this.page.listFilterOptions(0);
    const allType = availableTypes.find((option) => option.key === "" || option.label === "전체");
    const types = allType ? [allType] : this.currentOptionLast(availableTypes);

    const jobs: ProgramJob[] = [];
    for (const type of types) {
      await this.page.selectFilterOption(0, type.key);
      const availablePrograms = await this.page.listFilterOptions(1);
      const concretePrograms = availablePrograms.filter(
        (option) => option.key !== "00000000" && option.label !== "전체",
      );
      const programs = this.currentOptionLast(
        concretePrograms.length > 0 ? concretePrograms : availablePrograms,
      );

      for (const program of programs) jobs.push({ type, program });
    }

    const collected = await this.runInParallel(
      jobs,
      (page, job) =>
        this.step(`${tabs.microDegree.label} > ${job.program.label}`, async () => {
          const rows: RawCourse[] = [];
          await page.reset();
          await page.selectTab(tabs.microDegree.index);
          await page.selectFilterOption(0, job.type.key);
          await page.listFilterOptions(1);
          await page.selectFilterOption(1, job.program.key);
          await this.searchAndAppend(page, tabs.microDegree, rows);
          return rows;
        }),
      (job, rows, finished, total) =>
        this.reportUnit(job.program, finished - 1, total, rows.length),
    );

    for (const rows of collected) target.push(...rows);
  }

  // 페이지마다 일감을 하나씩 집어 간다. 결과는 일감 순서대로 돌려주므로 페이지 수와 무관하게 같다.
  // 진행 보고는 일감이 끝나는 즉시 흘려보낸다. 다 끝난 뒤 몰아서 알리면 가장 긴 구간이 조용해진다.
  private async runInParallel<Job, Result>(
    jobs: Job[],
    run: (page: SapCollectionPage, job: Job) => Promise<Result>,
    onFinished: (job: Job, result: Result, finished: number, total: number) => void,
  ): Promise<Result[]> {
    const results = new Array<Result>(jobs.length);
    let next = 0;
    let finished = 0;

    await Promise.all(
      this.pages.map(async (page) => {
        for (let index = next++; index < jobs.length; index = next++) {
          const job = jobs[index]!;
          const result = await run(page, job);
          results[index] = result;
          finished += 1;
          onFinished(job, result, finished, jobs.length);
        }
      }),
    );

    return results;
  }

  private async collectCurrentSelection(tab: TabDefinition, target: RawCourse[]): Promise<void> {
    await this.page.selectTab(tab.index);
    this.appendRows(tab, target, await this.page.readRows());
  }

  private async searchAndAppend(
    page: SapCollectionPage,
    tab: TabDefinition,
    target: RawCourse[],
    timeoutMs?: number,
  ): Promise<void> {
    const completed = await page.search(timeoutMs);
    if (!completed) return;
    this.appendRows(tab, target, await page.readRows());
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
