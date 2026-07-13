import { describe, expect, it, vi } from "vitest";

import type { CollectionProgress } from "../../../src/application/ports/collection-progress.js";
import { ShinhanSapCourseCollector } from "../../../src/infrastructure/sap/shinhan-sap-course-collector.js";
import type {
  SapCollectionPage,
  SapFilterOption,
} from "../../../src/infrastructure/sap/sap-collection-page.js";

// 어느 선택에서 나온 행인지 과목코드로 알 수 있게 한다. 그래야 수집 순서를 검증할 수 있다.
const rowFor = (courseCode: string): string[] => [
  "이론",
  courseCode,
  "홍길동",
  "월 1-2",
  "리나시타교양대학",
  "필수",
  "",
  "교양교육원",
  "40",
  "001",
  "",
  "",
  "",
  "계획",
  "1/1/0",
  "기독교의 이해",
];

const row = rowFor("GE61002");

// 먼저 맡은 일감이 가장 늦게 끝나도록 한다. 완료 순서와 일감 순서가 반드시 어긋난다.
const unitDelays: Record<string, number> = {
  "dept-a": 30,
  "dept-c": 1,
  "dept-b": 1,
  "program-b": 30,
  "program-a": 1,
};

function fakePage(): SapCollectionPage {
  let currentTab = 0;
  let selectedCollege = "college-a";
  let selectedMicroType = "type-a";
  let selectedUnit = "none";
  const optionsByFilter = new Map<string, SapFilterOption[]>([
    [
      "1:0",
      [
        { key: "4101", label: "시민과 사회" },
        { key: "4201", label: "인간과 문화" },
      ],
    ],
    [
      "3:0",
      [
        { key: "type-a", label: "유형 A" },
        { key: "type-b", label: "유형 B" },
      ],
    ],
    ["3:1:type-a", [{ key: "program-a", label: "과정 A" }]],
    ["3:1:type-b", [{ key: "program-b", label: "과정 B" }]],
    [
      "4:0",
      [
        { key: "college-a", label: "단과대학 A" },
        { key: "college-b", label: "단과대학 B" },
      ],
    ],
    ["4:1:college-a", [{ key: "dept-a", label: "학과 A" }]],
    [
      "4:1:college-b",
      [
        { key: "dept-b", label: "학과 B" },
        { key: "dept-c", label: "학과 C" },
      ],
    ],
  ]);
  const page: SapCollectionPage = {
    reset: vi.fn(async () => {
      currentTab = 0;
    }),
    selectTab: vi.fn(async (index) => {
      currentTab = index;
    }),
    listFilterOptions: vi.fn(
      async (filterIndex) =>
        optionsByFilter.get(
          currentTab === 4 && filterIndex === 1
            ? `${currentTab}:${filterIndex}:${selectedCollege}`
            : currentTab === 3 && filterIndex === 1
              ? `${currentTab}:${filterIndex}:${selectedMicroType}`
              : `${currentTab}:${filterIndex}`,
        ) ?? [],
    ),
    selectFilterOption: vi.fn(async (filterIndex, key) => {
      if (currentTab === 4 && filterIndex === 0) selectedCollege = key;
      if (currentTab === 3 && filterIndex === 0) selectedMicroType = key;
      if (filterIndex === 1) selectedUnit = key;
    }),
    search: vi.fn().mockResolvedValue(true),
    // 학과·과정마다 다른 행을 돌려준다. 그래야 수집 순서가 결과에 드러난다.
    // 학과마다 걸리는 시간을 다르게 두어 완료 순서가 일감 순서와 어긋나게 만든다.
    // 실제 SAP도 학과마다 응답이 제각각이므로, 지연이 없으면 병렬 순서 버그를 놓친다.
    readRows: vi.fn(async () => {
      if (currentTab !== 4 && currentTab !== 3) return [row];
      await new Promise((resolve) => setTimeout(resolve, unitDelays[selectedUnit] ?? 1));
      return [rowFor(selectedUnit)];
    }),
  };

  return page;
}

describe("ShinhanSapCourseCollector", () => {
  it("collects simple tabs, every core area, and every department option", async () => {
    const page = fakePage();
    const collector = new ShinhanSapCourseCollector(page);

    const courses = await collector.collect();

    expect(page.search).toHaveBeenCalledTimes(8);
    expect(page.selectFilterOption).toHaveBeenCalledWith(0, "4101");
    expect(page.selectFilterOption).toHaveBeenCalledWith(0, "4201");
    expect(page.selectFilterOption).toHaveBeenCalledWith(1, "dept-a");
    expect(page.selectFilterOption).toHaveBeenCalledWith(1, "dept-c");
    expect(page.selectFilterOption).toHaveBeenCalledWith(1, "program-a");
    expect(page.selectFilterOption).toHaveBeenCalledWith(1, "program-b");
    expect(courses).toHaveLength(6);
  });

  it("reports every tab it starts", async () => {
    const progress: CollectionProgress[] = [];
    await new ShinhanSapCourseCollector(fakePage(), (event) => progress.push(event)).collect();

    const phases = progress.filter((event) => event.type === "PHASE_STARTED");

    expect(phases.map((phase) => phase.label)).toEqual([
      "기초교양",
      "핵심교양(영역별)",
      "핵심교양",
      "교직",
      "마이크로디그리",
      "학과/전공",
    ]);
    expect(phases.every((phase) => phase.total === 6)).toBe(true);
    expect(phases.map((phase) => phase.index)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("reports each department and each micro degree program as it finishes", async () => {
    const progress: CollectionProgress[] = [];
    await new ShinhanSapCourseCollector(fakePage(), (event) => progress.push(event)).collect();

    const units = progress.filter((event) => event.type === "UNIT_COLLECTED");

    expect(units.map((unit) => unit.label)).toEqual([
      "시민과 사회",
      "인간과 문화",
      "과정 B",
      "과정 A",
      "학과 A",
      "학과 C",
      "학과 B",
    ]);
    // 학과 번호는 단과대학별이 아니라 전체 기준이다. "[42/289] 간호학과"가 진행률을 말해 준다.
    expect(units.filter((unit) => unit.label.startsWith("학과"))).toEqual([
      { type: "UNIT_COLLECTED", label: "학과 A", index: 1, total: 3, courses: 1 },
      { type: "UNIT_COLLECTED", label: "학과 C", index: 2, total: 3, courses: 1 },
      { type: "UNIT_COLLECTED", label: "학과 B", index: 3, total: 3, courses: 1 },
    ]);
  });

  it("reports how many courses each tab yielded", async () => {
    const progress: CollectionProgress[] = [];
    await new ShinhanSapCourseCollector(fakePage(), (event) => progress.push(event)).collect();

    const finished = progress.filter((event) => event.type === "PHASE_FINISHED");

    expect(finished.map((phase) => phase.label)).toEqual([
      "기초교양",
      "핵심교양(영역별)",
      "핵심교양",
      "교직",
      "마이크로디그리",
      "학과/전공",
    ]);
    expect(finished.every((phase) => phase.courses > 0)).toBe(true);
  });

  it("names the tab and the unit it was collecting when it fails", async () => {
    const page = fakePage();
    page.search = vi.fn(async () => {
      throw new Error("selector timeout");
    });

    await expect(new ShinhanSapCourseCollector(page).collect()).rejects.toThrow("기초교양");
  });

  it("names the department it was collecting when it fails", async () => {
    const page = fakePage();
    let searches = 0;
    const succeed = page.search;
    page.search = vi.fn(async (timeoutMs?: number) => {
      searches += 1;
      if (searches > 5) throw new Error("selector timeout");
      return succeed(timeoutMs);
    });

    await expect(new ShinhanSapCourseCollector(page).collect()).rejects.toThrow("학과 A");
  });

  it("collects the same courses whether it runs on one page or on several", async () => {
    const sequential = await new ShinhanSapCourseCollector(fakePage()).collect();
    const parallel = await new ShinhanSapCourseCollector([
      fakePage(),
      fakePage(),
      fakePage(),
    ]).collect();

    expect(parallel).toEqual(sequential);
  });

  it("keeps the collected order fixed no matter how many pages run", async () => {
    // 위의 "1개 vs 여러 개" 비교만으로는 부족하다. 양쪽을 똑같이 망가뜨리는 실수는 서로 같아 보인다.
    // 중복 제거가 먼저 온 행을 남기므로 순서가 흔들리면 데이터가 달라진다. 순서 자체를 못 박는다.
    const expected = [
      "GE61002", // 기초교양·핵심교양 (탭 순회)
      "program-b", // 마이크로디그리 — 일감 순서
      "program-a",
      "dept-a", // 학과 — 일감 순서 (단과대학 A → B)
      "dept-c",
      "dept-b",
    ];

    for (const pageCount of [1, 2, 3, 5]) {
      const pages = Array.from({ length: pageCount }, () => fakePage());
      const courses = await new ShinhanSapCourseCollector(pages).collect();

      expect(courses.map((course) => course.courseCode)).toEqual(expected);
    }
  });

  it("spreads the departments across every page it is given", async () => {
    const pages = [fakePage(), fakePage(), fakePage()];

    await new ShinhanSapCourseCollector(pages).collect();

    // 학과 순회는 페이지마다 reset을 부른다. 일감이 나뉘었다면 첫 페이지만 일하지 않는다.
    const searchesPerPage = pages.map((page) => vi.mocked(page.search).mock.calls.length);

    expect(searchesPerPage[0]).toBeGreaterThan(0);
    expect(searchesPerPage.slice(1).some((count) => count > 0)).toBe(true);
  });

  it("still reports every department once when it runs in parallel", async () => {
    const progress: CollectionProgress[] = [];
    await new ShinhanSapCourseCollector([fakePage(), fakePage()], (event) =>
      progress.push(event),
    ).collect();

    const departments = progress
      .filter((event) => event.type === "UNIT_COLLECTED")
      .filter((unit) => unit.label.startsWith("학과"));

    expect(departments.map((unit) => unit.label).sort()).toEqual(["학과 A", "학과 B", "학과 C"]);
    expect(departments.every((unit) => unit.total === 3)).toBe(true);
    expect(departments.map((unit) => unit.index).sort()).toEqual([1, 2, 3]);
  });

  it("reports a department the moment it finishes, not after the whole tab", async () => {
    // 학과 순회는 30분 넘게 걸린다. 다 끝난 뒤 몰아서 알리면 그동안 아무것도 보이지 않는다.
    const seen: string[] = [];
    const page = fakePage();
    const readRows = page.readRows;
    page.readRows = vi.fn(async () => {
      seen.push("수집");
      return readRows();
    });

    await new ShinhanSapCourseCollector([page], (event) => {
      if (event.type === "UNIT_COLLECTED" && event.label.startsWith("학과")) {
        seen.push(`보고:${event.label}`);
      }
    }).collect();

    // 학과 A를 보고한 뒤에도 수집이 더 남아 있어야 한다. 곧 보고가 수집과 섞여 흐른다는 뜻이다.
    const firstReport = seen.indexOf("보고:학과 A");
    expect(firstReport).toBeGreaterThanOrEqual(0);
    expect(seen.slice(firstReport).filter((entry) => entry === "수집").length).toBeGreaterThan(0);
  });
});
