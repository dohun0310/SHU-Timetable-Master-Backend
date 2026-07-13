import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PlaywrightSapCollectionPage } from "../../src/infrastructure/sap/playwright-sap-collection-page.js";

let browser: Awaited<ReturnType<typeof chromium.launch>>;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

describe("PlaywrightSapCollectionPage", () => {
  it("reads filter options and SAP table rows", async () => {
    const page = await browser.newPage();
    await page.route("**/sap/bc/webdynpro/**", async (route) => {
      await route.fulfill({ status: 200, body: "ok" });
    });
    await page.setContent(`
      <input ct="CB" id="global-1"><span id="global-1-btn"></span>
      <input ct="CB" id="global-2"><span id="global-2-btn"></span>
      <input ct="CB" id="global-3"><span id="global-3-btn"></span>
      <input ct="CB" id="filter" lsdata="{4:'a'}"><button id="filter-btn">open</button>
      <div ct="LIB_I" data-itemkey="a">Category A</div>
      <div id="option-b" ct="LIB_I" data-itemkey="b">Category B</div>
      <button ct="B">조회</button>
      <table ct="ST"><thead><tr>
        <th><span ct="CP">강의유형</span></th><th><span ct="CP">과목번호</span></th>
        <th><span ct="CP">담당교수</span></th><th><span ct="CP">강의시간</span></th>
        <th><span ct="CP">주관학과</span></th>
      </tr></thead><tbody id="table-contentTBody">
        <tr rr="1"><td cc="0">이론</td><td cc="1">GE61002</td><td cc="2">홍길동</td><td cc="3">월 1-2</td><td cc="4">리나시타교양대학</td></tr>
      </tbody></table>
      <script>
        window.application = {
          lightspeed: {
            oGetControlById: () => ({
              getValue: () => document.querySelector('#filter').getAttribute('lsdata').match(/4:'([^']*)'/)?.[1] ?? '',
              setText: (value) => { document.querySelector('#filter').value = value; },
              setValue: (value) => { document.querySelector('#filter').setAttribute('lsdata', "{4:'" + value + "'}"); },
            }),
          },
        };
      </script>
    `);
    const collectionPage = new PlaywrightSapCollectionPage(page);

    await expect(collectionPage.listFilterOptions(0)).resolves.toEqual([
      { key: "a", label: "Category A" },
      { key: "b", label: "Category B" },
    ]);
    await collectionPage.selectFilterOption(0, "b");
    await expect(collectionPage.readRows()).resolves.toEqual([
      [
        "이론",
        "GE61002",
        "홍길동",
        "월 1-2",
        "리나시타교양대학",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);

    await page.close();
  });
});
