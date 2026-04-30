"use strict";

const { test, expect } = require("@playwright/test");
const { launch } = require("../helpers/launch");
const { routeSoma, PAGED_COUNTS } = require("../helpers/route-soma");
const { swSetStorage, swGetStorage, swSendMessage } = require("../helpers/sw");

test.describe("C background polling populates lectureSnapshot", () => {
  let handle;

  test.afterEach(async () => {
    if (handle) await handle.cleanup();
    handle = null;
  });

  test("POLLING_TRIGGER_NOW fetches list.html, parses and stores snapshot", async () => {
    handle = await launch();
    await routeSoma(handle.ctx);

    await swSetStorage(handle.ctx, "sync", {
      pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    });

    const result = await swSendMessage(handle.ctx, handle.extId, {
      type: "POLLING_TRIGGER_NOW",
    });
    expect(result?.ok, `polling result: ${JSON.stringify(result)}`).toBe(true);
    expect(result.lectureCount).toBeGreaterThan(0);

    const got = await swGetStorage(handle.ctx, "local", "lectureSnapshot");
    expect(got.lectureSnapshot).toBeTruthy();
    expect(got.lectureSnapshot.lectures.length).toBeGreaterThan(0);
  });

  // B-9 회귀 방지: 첫 번째 list.do 요청 URL에 menuNo=200046 포함
  test("(B-9) polling URL contains menuNo=200046", async () => {
    handle = await launch();
    const capturedUrls = [];
    await routeSoma(handle.ctx, {
      onListRequest: (url) => capturedUrls.push(url.toString()),
    });

    await swSetStorage(handle.ctx, "sync", {
      pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    });

    await swSendMessage(handle.ctx, handle.extId, { type: "POLLING_TRIGGER_NOW" });

    expect(capturedUrls.length, "list.do should be requested at least once").toBeGreaterThan(0);
    const first = capturedUrls[0];
    expect(first, `first URL: ${first}`).toContain("menuNo=200046");
  });

  // B-10 회귀 방지: list.do 요청 URL에 scdate/ecdate 포함
  test("(B-10) polling URL contains scdate and ecdate", async () => {
    handle = await launch();
    const capturedUrls = [];
    await routeSoma(handle.ctx, {
      onListRequest: (url) => capturedUrls.push(url.toString()),
    });

    await swSetStorage(handle.ctx, "sync", {
      pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    });

    await swSendMessage(handle.ctx, handle.extId, { type: "POLLING_TRIGGER_NOW" });

    expect(capturedUrls.length).toBeGreaterThan(0);
    const first = capturedUrls[0];
    expect(first, `first URL: ${first}`).toMatch(/scdate=\d{4}-\d{2}-\d{2}/);
    expect(first, `first URL: ${first}`).toMatch(/ecdate=\d{4}-\d{2}-\d{2}/);
  });

  // 페이지네이션 회귀 방지: pageIndex 1→2→3→4 순 fetch, page4(0건)에서 중단 (총 4 요청)
  test("pagination fetches pages 1-3 and stops at page4 empty response", async () => {
    handle = await launch();
    const capturedPageIndexes = [];
    await routeSoma(handle.ctx, {
      pagedList: true,
      onListRequest: (url) => {
        const pi = Number(url.searchParams.get("pageIndex") || "1");
        capturedPageIndexes.push(pi);
      },
    });

    await swSetStorage(handle.ctx, "sync", {
      pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    });

    const result = await swSendMessage(handle.ctx, handle.extId, { type: "POLLING_TRIGGER_NOW" });
    expect(result?.ok, `polling result: ${JSON.stringify(result)}`).toBe(true);

    // page1(파라미터 없음→1), page2, page3, page4(빈 응답→중단) 총 4회
    expect(capturedPageIndexes.length, `captured: ${JSON.stringify(capturedPageIndexes)}`).toBe(4);
    expect(capturedPageIndexes).toEqual([1, 2, 3, 4]);
  });

  // 페이지네이션 합산: page1(10)+page2(10)+page3(5)=25건 스냅샷
  test("pagination aggregates lectures from all pages (total 25)", async () => {
    handle = await launch();
    await routeSoma(handle.ctx, { pagedList: true });

    await swSetStorage(handle.ctx, "sync", {
      pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    });

    const result = await swSendMessage(handle.ctx, handle.extId, { type: "POLLING_TRIGGER_NOW" });
    expect(result?.ok, `polling result: ${JSON.stringify(result)}`).toBe(true);

    const got = await swGetStorage(handle.ctx, "local", "lectureSnapshot");
    expect(got.lectureSnapshot).toBeTruthy();
    const expected = PAGED_COUNTS[1] + PAGED_COUNTS[2] + PAGED_COUNTS[3];
    expect(
      got.lectureSnapshot.lectures.length,
      `snapshot lectures: ${got.lectureSnapshot.lectures.length}, expected: ${expected}`
    ).toBe(expected);
  });
});
