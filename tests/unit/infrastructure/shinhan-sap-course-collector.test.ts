import { describe, expect, it, vi } from "vitest";

import { ShinhanSapCourseCollector } from "../../../src/infrastructure/sap/shinhan-sap-course-collector.js";
import type {
  SapCollectionPage,
  SapFilterOption,
} from "../../../src/infrastructure/sap/sap-collection-page.js";

const row = [
  "이론",
  "",
  "GE61002",
  "홍길동",
  "리나시타교양대학",
  "월 1-2",
  "필수",
  "기독교의 이해",
  "교양교육원",
  "40",
  "001",
  "",
  "",
  "",
  "",
  "1/1/0",
];

describe("ShinhanSapCourseCollector", () => {
  it("collects simple tabs, every core area, and every department option", async () => {
    let currentTab = 0;
    let selectedCollege = "college-a";
    const optionsByFilter = new Map<string, SapFilterOption[]>([
      ["1:0", [{ key: "4101", label: "시민과 사회" }, { key: "4201", label: "인간과 문화" }]],
      ["4:0", [{ key: "college-a", label: "단과대학 A" }, { key: "college-b", label: "단과대학 B" }]],
      ["4:1:college-a", [{ key: "dept-a", label: "학과 A" }]],
      ["4:1:college-b", [{ key: "dept-b", label: "학과 B" }, { key: "dept-c", label: "학과 C" }]],
    ]);
    const page: SapCollectionPage = {
      selectTab: vi.fn(async (index) => {
        currentTab = index;
      }),
      listFilterOptions: vi.fn(async (filterIndex) =>
        optionsByFilter.get(
          currentTab === 4 && filterIndex === 1
            ? `${currentTab}:${filterIndex}:${selectedCollege}`
            : `${currentTab}:${filterIndex}`,
        ) ?? [],
      ),
      selectFilterOption: vi.fn(async (filterIndex, key) => {
        if (currentTab === 4 && filterIndex === 0) selectedCollege = key;
      }),
      search: vi.fn().mockResolvedValue(undefined),
      readRows: vi.fn().mockResolvedValue([row]),
    };
    const collector = new ShinhanSapCourseCollector(page);

    const courses = await collector.collect();

    expect(page.search).toHaveBeenCalledTimes(6);
    expect(page.selectFilterOption).toHaveBeenCalledWith(0, "4101");
    expect(page.selectFilterOption).toHaveBeenCalledWith(0, "4201");
    expect(page.selectFilterOption).toHaveBeenCalledWith(1, "dept-a");
    expect(page.selectFilterOption).toHaveBeenCalledWith(1, "dept-c");
    expect(courses).toHaveLength(1);
  });
});
