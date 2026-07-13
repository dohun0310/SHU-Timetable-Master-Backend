import { describe, expect, it, vi } from "vitest";

import type { CollectionProgress } from "../../../src/application/ports/collection-progress.js";
import { ShinhanSapCourseCollector } from "../../../src/infrastructure/sap/shinhan-sap-course-collector.js";
import type {
  SapCollectionPage,
  SapFilterOption,
} from "../../../src/infrastructure/sap/sap-collection-page.js";

const row = [
  "이론",
  "GE61002",
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

function fakePage(): SapCollectionPage {
  let currentTab = 0;
  let selectedCollege = "college-a";
  let selectedMicroType = "type-a";
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
    }),
    search: vi.fn().mockResolvedValue(true),
    readRows: vi.fn().mockResolvedValue([row]),
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
    expect(courses).toHaveLength(1);
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
    expect(units.filter((unit) => unit.label.startsWith("학과"))).toEqual([
      { type: "UNIT_COLLECTED", label: "학과 A", index: 1, total: 1, courses: 1 },
      { type: "UNIT_COLLECTED", label: "학과 C", index: 1, total: 2, courses: 1 },
      { type: "UNIT_COLLECTED", label: "학과 B", index: 2, total: 2, courses: 1 },
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
});
