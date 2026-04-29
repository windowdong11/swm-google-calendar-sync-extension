"use strict";

const { test, expect } = require("@playwright/test");
const { launch } = require("../helpers/launch");
const { stubIdentity } = require("../helpers/stub-identity");
const { routeGoogle } = require("../helpers/route-google");
const { routeSoma } = require("../helpers/route-soma");
const { swSetStorage } = require("../helpers/sw");
const { CalendarPage } = require("../pages/calendar.page");

function ksDateStr(date) {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

test.describe("B-4 click suggestion card opens SoMA detail", () => {
  let handle;

  test.afterEach(async () => {
    if (handle) await handle.cleanup();
    handle = null;
  });

  test("clicking lecture card opens detail URL in new tab", async () => {
    handle = await launch();
    await stubIdentity(handle.ctx);
    await routeGoogle(handle.ctx, { events: { kind: "calendar#events", items: [] } });
    await routeSoma(handle.ctx);

    const today = new Date();
    const anchor = new Date(today);
    anchor.setDate(today.getDate() + 9);
    const dateStr = ksDateStr(anchor);

    const lec = {
      qustnrSn: "card-click-target",
      title: "[E2E] 카드 클릭 → 상세 진입",
      startAt: `${dateStr}T14:00:00+09:00`,
      endAt: `${dateStr}T16:00:00+09:00`,
      url: "https://swmaestro.ai/sw/mypage/mentoLec/view.do?qustnrSn=card-click-target",
      detailUrl: "https://swmaestro.ai/sw/mypage/mentoLec/view.do?qustnrSn=card-click-target",
      capacity: 30,
      applyCnt: 5,
      applied: false,
      statusText: "신청 가능",
    };

    await swSetStorage(handle.ctx, "local", {
      lectureSnapshot: {
        lectures: [lec],
        takenAt: new Date().toISOString(),
        sourceComplete: true,
      },
      calendarAnchorDate: anchor.toISOString(),
      calendarViewMode: "week",
    });

    const page = await handle.ctx.newPage();
    const cal = new CalendarPage(page, handle.extId);
    await cal.open();
    await cal.waitForGrid();

    await expect(cal.suggestionCards()).toHaveCount(1);

    const [popup] = await Promise.all([
      handle.ctx.waitForEvent("page", { timeout: 5_000 }),
      cal.suggestionCards().first().click(),
    ]);
    expect(popup.url()).toMatch(
      /swmaestro\.ai\/sw\/mypage\/mentoLec\/view\.do\?qustnrSn=card-click-target/
    );
  });
});
