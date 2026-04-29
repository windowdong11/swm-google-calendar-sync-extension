"use strict";

const { test, expect } = require("@playwright/test");
const { launch } = require("../helpers/launch");
const { stubIdentity, stubIdentityFailure } = require("../helpers/stub-identity");
const { routeGoogle } = require("../helpers/route-google");
const { swSetStorage } = require("../helpers/sw");
const { CalendarPage } = require("../pages/calendar.page");

function ksDateStr(date) {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function buildEventsFixture(dateStr) {
  return {
    kind: "calendar#events",
    items: [
      {
        kind: "calendar#event",
        id: "evt-e2e-001",
        status: "confirmed",
        summary: "기존 미팅 (e2e fixture)",
        start: { dateTime: `${dateStr}T10:00:00+09:00`, timeZone: "Asia/Seoul" },
        end: { dateTime: `${dateStr}T11:00:00+09:00`, timeZone: "Asia/Seoul" },
      },
    ],
  };
}

test.describe("B-2 calendar renders 08-24 axis with events", () => {
  let handle;

  test.afterEach(async () => {
    if (handle) await handle.cleanup();
    handle = null;
  });

  // 차단: 본 spec 12 인프라가 발견한 spec 01 회귀.
  // service-worker.js의 normalizeEvent (L200-217)는 Google API 응답을
  // { id, title, startAt, endAt, htmlLink, calendarId, transparency,
  //   isSomaLecture, somaQustnrSn } 평면 객체로 변환해 GET_CALENDAR_EVENTS
  // 응답으로 보낸다. 그러나 calendar-view.js의 splitEventByDay (L66) 등은
  // event.start.dateTime / event.extendedProperties.private 같은 raw 형식을
  // 기대해, events가 1개라도 있으면 "Cannot read properties of undefined
  // (reading 'dateTime')" 로 그리드 렌더가 죽는다.
  //
  // events 빈 배열에서는 for 루프가 skip되어 그리드가 정상 렌더되므로
  // B-3·B-4는 통과한다. spec 01 fix(별도 후속 PR) 후 .skip 제거.
  test("renders hour labels 08:00 and 23:00 with mock event block — blocked by spec 01 regression", async () => {
    handle = await launch();
    await stubIdentity(handle.ctx);

    const today = new Date();
    const anchor = new Date(today);
    anchor.setDate(today.getDate() + 9);
    const dateStr = ksDateStr(anchor);

    await routeGoogle(handle.ctx, { events: buildEventsFixture(dateStr) });
    await swSetStorage(handle.ctx, "local", {
      calendarAnchorDate: anchor.toISOString(),
      calendarViewMode: "week",
    });

    const page = await handle.ctx.newPage();
    const cal = new CalendarPage(page, handle.extId);
    await cal.open();
    await cal.waitForGrid();

    await expect(cal.hourLabel(8)).toBeVisible();
    await expect(cal.hourLabel(23)).toBeVisible();
    await expect(cal.eventBlocks()).toHaveCount(1);
    await expect(cal.eventBlocks().first()).toContainText("기존 미팅");
    await expect(cal.authError()).toBeHidden();
  });

  test("renders 08:00 and 23:00 axis labels with empty events", async () => {
    handle = await launch();
    await stubIdentity(handle.ctx);

    const today = new Date();
    const anchor = new Date(today);
    anchor.setDate(today.getDate() + 9);

    await routeGoogle(handle.ctx, { events: { kind: "calendar#events", items: [] } });
    await swSetStorage(handle.ctx, "local", {
      calendarAnchorDate: anchor.toISOString(),
      calendarViewMode: "week",
    });

    const page = await handle.ctx.newPage();
    const cal = new CalendarPage(page, handle.extId);
    await cal.open();
    await cal.waitForGrid();

    await expect(cal.hourLabel(8)).toBeVisible();
    await expect(cal.hourLabel(23)).toBeVisible();
    await expect(cal.eventBlocks()).toHaveCount(0);
    await expect(cal.authError()).toBeHidden();
  });

  test("shows auth error message when getAuthToken rejects", async () => {
    handle = await launch();
    await stubIdentityFailure(handle.ctx, "OAuth not granted (e2e)");
    // 인증 실패 시 SW가 fetchCalendarEvents 단계에서 throw → calendar.js catch에서
    // events=[], authError.hidden=false. 그리드 자체는 정상 렌더되므로 waitForGrid 통과.

    const today = new Date();
    const anchor = new Date(today);
    anchor.setDate(today.getDate() + 9);
    await swSetStorage(handle.ctx, "local", {
      calendarAnchorDate: anchor.toISOString(),
      calendarViewMode: "week",
    });

    const page = await handle.ctx.newPage();
    const cal = new CalendarPage(page, handle.extId);
    await cal.open();
    await cal.waitForGrid();

    await expect(cal.authError()).toBeVisible();
  });
});
