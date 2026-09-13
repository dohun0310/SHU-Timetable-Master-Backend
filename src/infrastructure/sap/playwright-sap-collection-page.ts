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
      const visibleTabs = [
        ...document.querySelectorAll<HTMLElement>('[ct="TSITM_standards"]'),
      ].filter((element) => element.offsetParent !== null);
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
    const currentValue = await this.getComboValue(id);
    if (currentValue === key) return;

    let label = this.filterLabels.get(`${filterIndex}:${key}`);
    if (!label) {
      await this.listFilterOptions(filterIndex);
      label = this.filterLabels.get(`${filterIndex}:${key}`);
    }
    if (!label) throw new Error(`SAP 필터 옵션 ${key}의 라벨을 찾을 수 없습니다.`);

    const possibleResponse = this.waitForSapResponse(30_000).catch(() => null);
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

    await Promise.race([possibleResponse, this.page.waitForTimeout(1_000)]);
    await this.waitForSapIdle();
    const updatedId = await this.findFilterInputId(filterIndex);
    const updatedValue = updatedId ? await this.getComboValue(updatedId) : null;
    if (updatedValue !== key) {
      throw new Error(
        `SAP 필터 ${filterIndex}에 옵션 ${key}를 적용하지 못했습니다. 실제 값: ${updatedValue ?? "없음"}`,
      );
    }
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
    const canonicalHeaders = [
      "강의유형",
      "과목번호",
      "담당교수",
      "강의시간",
      "주관학과",
      "이수구분",
      "PF/PN여부",
      "전공",
      "정원",
      "분반",
      "수강자격",
      "수강유의사항",
      "수업계획서 영상",
      "계획",
      "학점/이론/실습",
      "과목명",
    ];
    const table = this.page.locator('[ct="ST"]:visible').first();
    const rows = await table.evaluate((element, expectedHeaders) => {
      const visibleHeaders = [...element.querySelectorAll<HTMLElement>('[ct="CP"]')].map((header) =>
        (header.textContent ?? "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      );
      const sourceIndex = new Map(visibleHeaders.map((header, index) => [header, index]));

      return [...element.querySelectorAll<HTMLElement>('tbody[id$="-contentTBody"] tr[rr]')].map(
        (row) => {
          const sourceCells = [...row.querySelectorAll<HTMLTableCellElement>("td[cc]")]
            .sort(
              (left, right) => Number(left.getAttribute("cc")) - Number(right.getAttribute("cc")),
            )
            .map((cell) => {
              // SAP\uc740 \ud55c \uce78\uc5d0 \uac12\uc774 \uc5ec\ub7ff\uc774\uba74 <br>\ub85c \ub098\ub208\ub2e4. \uad50\uc218 \ub450 \uba85, \uc804\uacf5 \ub450 \uac1c, \uad50\uc2dc \uc5ec\ub7ec \uac1c\uac00 \uadf8\ub807\ub2e4.
              // textContent\ub294 <br>\uc744 \ubc84\ub824 \uac12\uc744 \uc774\uc5b4\ubd99\uc778\ub2e4. "\uac04\ud638\ud559\uacfc"+"\uac04\ud638\ud559\uacfc" \u2192 "\uac04\ud638\ud559\uacfc\uac04\ud638\ud559\uacfc".
              // \uc904 \uad6c\ubd84\uc744 \uc0b4\ub824 \uc77d\uace0, \uac12\uc744 \ub098\ub204\ub294 \uc77c\uc740 \uc77d\ub294 \ucabd\uc5d0 \ub9e1\uae34\ub2e4.
              const clone = cell.cloneNode(true) as HTMLElement;
              for (const lineBreak of clone.querySelectorAll("br")) {
                lineBreak.replaceWith("\n");
              }

              return (clone.textContent ?? "")
                .replace(/\u00a0/g, " ")
                .split("\n")
                .map((line) => line.replace(/\s+/g, " ").trim())
                .filter((line) => line.length > 0)
                .join("\n");
            });
          return expectedHeaders.map((header) => {
            const index = sourceIndex.get(header);
            return index === undefined ? "" : (sourceCells[index] ?? "");
          });
        },
      );
    }, canonicalHeaders);

    return rows.filter((cells) => (cells[1] ?? "").length > 0);
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

  private getComboValue(id: string): Promise<string> {
    return this.page.evaluate((comboId) => {
      const app = (
        window as unknown as {
          application: {
            lightspeed: {
              oGetControlById(id: string): { getValue(): string };
            };
          };
        }
      ).application;
      return app.lightspeed.oGetControlById(comboId).getValue();
    }, id);
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
      (request) => request.method() === "POST" && request.url().includes("/sap/bc/webdynpro/"),
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
