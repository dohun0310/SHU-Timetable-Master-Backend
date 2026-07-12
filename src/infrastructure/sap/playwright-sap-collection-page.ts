import type { Page } from "playwright";

import type { SapCollectionPage, SapFilterOption } from "./sap-collection-page.js";

export class PlaywrightSapCollectionPage implements SapCollectionPage {
  private readonly filterLabels = new Map<string, string>();

  constructor(
    private readonly page: Page,
    private readonly resetPage?: () => Promise<void>,
  ) {}

  async reset(): Promise<void> {
    if (!this.resetPage) throw new Error("SAP 수집 페이지 재설정 함수가 없습니다.");
    await this.resetPage();
    this.filterLabels.clear();
  }

  async selectTab(index: number): Promise<void> {
    await this.waitForSapIdle();
    await this.page.keyboard.press("Escape");
    await this.page.locator("#urPopupWindowBlockLayer").evaluateAll((elements) => {
      for (const element of elements) element.remove();
    });
    const tab = this.page.locator('[ct="TSITM_standards"]:visible').nth(index);
    const possibleResponse = this.waitForSapResponse(1_500).catch(() => null);
    await tab.locator(".lsTbsv5-ItemTitle").evaluate((element) => (element as HTMLElement).click());
    await this.page.waitForFunction((tabIndex) => {
      const visibleTabs = [...document.querySelectorAll<HTMLElement>('[ct="TSITM_standards"]')].filter(
        (element) => element.offsetParent !== null,
      );
      return visibleTabs[tabIndex]?.hasAttribute("selected") ?? false;
    }, index);
    if (await possibleResponse) await this.waitForSapIdle();
    else await this.page.waitForTimeout(1_000);
  }

  async listFilterOptions(filterIndex: number): Promise<SapFilterOption[]> {
    const id = await this.findFilterInputId(filterIndex);
    if (!id) return [];

    await this.page.locator(`#${id}-btn`).evaluate((element) => (element as HTMLElement).click());
    const visibleOptions = this.page.locator('[ct="LIB_I"]:visible');
    const opened = await visibleOptions
      .first()
      .waitFor({ timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (!opened) {
      await this.page.keyboard.press("Escape");
      return [];
    }
    const options = await visibleOptions.evaluateAll((elements) =>
      elements
        .map((element) => ({
          key: element.getAttribute("data-itemkey") ?? "",
          label: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
        }))
        .filter((option) => option.label.length > 0),
    );
    for (const option of options) {
      this.filterLabels.set(`${filterIndex}:${option.key}`, option.label);
    }
    await this.page.keyboard.press("Escape");
    return options;
  }

  async selectFilterOption(filterIndex: number, key: string): Promise<void> {
    const id = await this.findFilterInputId(filterIndex);
    if (!id) throw new Error(`SAP 필터 ${filterIndex}의 ID를 찾을 수 없습니다.`);
    const input = this.page.locator(`#${id}`);
    const currentData = await input.getAttribute("lsdata");
    const isCurrent = currentData?.includes(`4:'${key}'`) ?? false;
    if (isCurrent) return;
    let label = this.filterLabels.get(`${filterIndex}:${key}`) ?? (await input.inputValue()).trim();

    if (!this.filterLabels.has(`${filterIndex}:${key}`)) {
      await this.page.locator(`#${id}-btn`).evaluate((element) => (element as HTMLElement).click());
      const option = this.page.locator(`[ct="LIB_I"][data-itemkey="${key}"]:visible`);
      label = (await option.textContent())?.trim() ?? "";
      if (!label) throw new Error(`SAP 필터 옵션 ${key}의 라벨을 찾을 수 없습니다.`);
      await this.page.keyboard.press("Escape");
    }

    const possibleResponse = this.waitForSapResponse(1_000).catch(() => null);
    await this.page.evaluate(
      ({ comboId, itemKey, itemLabel }) => {
        const app = (
          window as unknown as {
            application: {
              lightspeed: {
                oGetControlById(id: string): {
                  setText(value: string): void;
                  setValue(value: string): void;
                };
              };
            };
          }
        ).application;
        const combo = app.lightspeed.oGetControlById(comboId);
        combo.setText(itemLabel);
        combo.setValue(itemKey);
      },
      { comboId: id, itemKey: key, itemLabel: label },
    );
    await possibleResponse;
    await this.waitForSapIdle();
  }

  async search(timeoutMs = 2_000): Promise<boolean> {
    const button = this.page
      .locator('[ct="B"]:visible')
      .filter({ hasText: /^(조회|Search)$/ })
      .first();

    try {
      await Promise.all([
        this.waitForSapRequest(timeoutMs),
        this.waitForSapResponse(30_000),
        button.evaluate((element) => (element as HTMLElement).click()),
      ]);
      await this.waitForSapIdle();
      return true;
    } catch {
      await this.waitForSapIdle();
      // SAP는 조회 대상이 없을 때 Press 왕복 없이 현재 테이블을 빈 상태로 유지한다.
      return false;
    }
  }

  async readRows(): Promise<string[][]> {
    const rows = await this.page
      .locator('[ct="ST"]:visible tbody[id$="-contentTBody"] tr[rr]')
      .evaluateAll((elements) =>
        elements.map((element) =>
          [...element.querySelectorAll<HTMLTableCellElement>("td[cc]")]
            .sort((left, right) => Number(left.getAttribute("cc")) - Number(right.getAttribute("cc")))
            .map((cell) => cell.textContent?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() ?? ""),
        ),
      );

    return rows.filter((cells) => (cells[4] ?? "").length > 0);
  }

  private async findFilterInputId(filterIndex: number): Promise<string | null> {
    return this.page.locator('input[ct="CB"]:visible').evaluateAll((elements, index) => {
      const globalContainer = elements[0]?.closest('[ct="ML"]');
      const filters = globalContainer
        ? elements.filter((element) => element.closest('[ct="ML"]') !== globalContainer)
        : elements.slice(3);
      return filters[index]?.id || null;
    }, filterIndex);
  }

  private waitForSapResponse(timeout = 30_000) {
    return this.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().includes("/sap/bc/webdynpro/"),
      { timeout },
    );
  }

  private waitForSapRequest(timeout = 2_000) {
    return this.page.waitForRequest(
      (request) =>
        request.method() === "POST" && request.url().includes("/sap/bc/webdynpro/"),
      { timeout },
    );
  }

  private async waitForSapIdle(): Promise<void> {
    await this.page.waitForTimeout(150);
    await this.page.waitForFunction(() => {
      const app = (window as unknown as { application?: { pendingRequest?: unknown } }).application;
      return !app?.pendingRequest;
    });
    await this.page.waitForTimeout(200);
  }
}
