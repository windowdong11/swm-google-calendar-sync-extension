"use strict";

/**
 * Page Object: chrome-extension://<id>/src/calendar/calendar.html
 *
 * src/calendar/calendar.html, calendar-view.js의 셀렉터를 한 곳에서 관리.
 * src/calendar/* DOM이 변경되면 이 파일만 수정하면 모든 e2e 시나리오가 자동 적응.
 *
 * 셀렉터 reference:
 *   - 그리드 컨테이너: #cal-grid
 *   - 시간 라벨: .cal-hour-label (textContent "08:00" ~ "24:00")
 *   - 요일 컬럼: .cal-week-col[data-date="YYYY-MM-DD"]
 *   - 이벤트 블록: .cal-event (.soma-managed if SOMA-linked)
 *   - 사이드 패널 카드: .lecture-card[role="button"]
 *   - 사이드 패널 빈 상태: .side-empty-msg
 *   - drag 라벨: #lbl-drag-range
 *   - drag 해제: #btn-clear-drag
 */
class CalendarPage {
  constructor(page, extId) {
    this.page = page;
    this.extId = extId;
  }

  url() {
    return `chrome-extension://${this.extId}/src/calendar/calendar.html`;
  }

  async open() {
    await this.page.goto(this.url(), { waitUntil: "domcontentloaded" });
    return this;
  }

  async waitForGrid() {
    await this.page.locator("#cal-grid .cal-week-col").first().waitFor({ state: "visible", timeout: 15_000 });
    return this;
  }

  hourLabel(hour) {
    const text = `${String(hour).padStart(2, "0")}:00`;
    return this.page.locator(".cal-hour-label", { hasText: text });
  }

  dayColumn(dateStr) {
    return this.page.locator(`.cal-week-col[data-date="${dateStr}"]`);
  }

  eventBlocks() {
    return this.page.locator(".cal-event");
  }

  somaEventBlocks() {
    return this.page.locator(".cal-event.soma-managed");
  }

  suggestionCards() {
    return this.page.locator(".lecture-card");
  }

  emptyMessage() {
    return this.page.locator(".side-empty-msg");
  }

  authError() {
    return this.page.locator("#cal-auth-error");
  }

  /**
   * 빈 시간 영역 드래그.
   * dateStr: YYYY-MM-DD (해당 컬럼)
   * startHour ~ endHour: 정수 시각 (08~24)
   */
  async dragRange(dateStr, startHour, endHour) {
    const col = this.dayColumn(dateStr);
    await col.waitFor({ state: "visible", timeout: 5_000 });
    const box = await col.boundingBox();
    if (!box) throw new Error(`day-column[${dateStr}] no boundingBox`);

    const PIXELS_PER_HOUR = 60;
    const WEEK_START_HOUR = 8;
    const yFor = (h) => box.y + (h - WEEK_START_HOUR) * PIXELS_PER_HOUR + 2;
    const xMid = box.x + box.width / 2;

    await this.page.mouse.move(xMid, yFor(startHour));
    await this.page.mouse.down();
    await this.page.mouse.move(xMid, yFor(endHour), { steps: 8 });
    await this.page.mouse.up();
    return this;
  }

  async clearDrag() {
    await this.page.locator("#btn-clear-drag").click();
    return this;
  }
}

module.exports = { CalendarPage };
