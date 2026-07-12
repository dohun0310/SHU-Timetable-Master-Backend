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
      <table ct="ST"><tbody id="table-contentTBody">
        <tr rr="1"><td cc="0">이론</td><td cc="1"></td><td cc="2">필수</td><td cc="3"></td><td cc="4">GE61002</td></tr>
      </tbody></table>
      <script>
        window.application = {
          lightspeed: {
            oGetControlById: () => ({
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
      ["이론", "", "필수", "", "GE61002"],
    ]);

    await page.close();
  });
});
