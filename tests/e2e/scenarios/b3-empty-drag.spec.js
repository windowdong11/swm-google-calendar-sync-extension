"use strict";

const { test, expect } = require("@playwright/test");
const { launch } = require("../helpers/launch");
const { stubIdentity } = require("../helpers/stub-identity");
const { routeGoogle } = require("../helpers/route-google");
const { swSetStorage } = require("../helpers/sw");
const { CalendarPage } = require("../pages/calendar.page");

function ksDateStr(date) {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

test.describe("B-3 drag empty area filters lectures", () => {
  let handle;

  test.afterEach(async () => {
    if (handle) await handle.cleanup();
    handle = null;
  });

  test("drag inside a column shows only lectures fully contained in range", async () => {
    handle = await launch();
    await stubIdentity(handle.ctx);
    await routeGoogle(handle.ctx, {
      events: { kind: "calendar#events", items: [] },
    });

    // 다음 주 화요일을 anchor로 잡아 시간 충돌 없이 빈 영역 드래그가 가능하도록.
    const today = new Date();
    const anchor = new Date(today);
    anchor.setDate(today.getDate() + 9);
    const dateStr = ksDateStr(anchor);

    const lecInside = {
      qustnrSn: "drag-fit",
      title: "[E2E] 드래그 범위 안 강의",
      startAt: `${dateStr}T14:00:00+09:00`,
      endAt: `${dateStr}T16:00:00+09:00`,
      url: `https://swmaestro.ai/sw/mypage/mentoLec/view.do?qustnrSn=drag-fit`,
      detailUrl: `https://swmaestro.ai/sw/mypage/mentoLec/view.do?qustnrSn=drag-fit`,
      capacity: 30,
      applyCnt: 5,
      applied: false,
      statusText: "신청 가능",
    };
    const lecOutside = {
      qustnrSn: "drag-out",
      title: "[E2E] 드래그 범위 밖 강의",
      startAt: `${dateStr}T19:00:00+09:00`,
      endAt: `${dateStr}T21:00:00+09:00`,
      url: `https://swmaestro.ai/sw/mypage/mentoLec/view.do?qustnrSn=drag-out`,
      detailUrl: `https://swmaestro.ai/sw/mypage/mentoLec/view.do?qustnrSn=drag-out`,
      capacity: 30,
      applyCnt: 5,
      applied: false,
      statusText: "신청 가능",
    };

    await swSetStorage(handle.ctx, "local", {
      lectureSnapshot: {
        lectures: [lecInside, lecOutside],
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

    // 드래그 전: 두 강의 모두 사이드 패널에 표시 (dragRange null → 전체 미신청)
    await expect(cal.suggestionCards()).toHaveCount(2);

    // 13:00 ~ 17:00 드래그 → "안 강의" (14:00~16:00) 만 포함
    await cal.dragRange(dateStr, 13, 17);

    const cards = cal.suggestionCards();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("드래그 범위 안 강의");
  });
});
