"use strict";

const { test, expect } = require("@playwright/test");
const { launch } = require("../helpers/launch");
const { stubIdentity } = require("../helpers/stub-identity");
const { routeGoogle } = require("../helpers/route-google");
const { swEval } = require("../helpers/sw");

/**
 * B-1: 툴바 SOMA 아이콘 클릭 → calendar.html 새 탭. 두 번째 클릭 시 같은 탭 활성화.
 *
 * Playwright는 toolbar 아이콘 자체를 클릭할 수 없어, service-worker.js의
 * chrome.action.onClicked 핸들러와 동일한 흐름을 SW context에서 실행해 검증한다.
 * 단위 검증(listener가 등록되었는지)은 별도 단위 테스트로 보강.
 */

const CLICK_FN = async () => {
  const calendarUrl = chrome.runtime.getURL("src/calendar/calendar.html");
  const [existingTab] = await chrome.tabs.query({ url: calendarUrl });
  if (existingTab) {
    await chrome.tabs.update(existingTab.id, { active: true });
    return { branch: "update", tabId: existingTab.id };
  }
  const created = await chrome.tabs.create({ url: calendarUrl });
  return { branch: "create", tabId: created.id };
};

test.describe("B-1 toolbar action opens calendar tab", () => {
  let handle;

  test.afterEach(async () => {
    if (handle) await handle.cleanup();
    handle = null;
  });

  test("first click opens calendar.html in a new tab", async () => {
    handle = await launch();
    await stubIdentity(handle.ctx);
    await routeGoogle(handle.ctx, {
      events: { kind: "calendar#events", items: [] },
    });

    const initial = handle.ctx.pages().length;

    const newPagePromise = handle.ctx.waitForEvent("page", { timeout: 10_000 });
    const first = await swEval(handle.ctx, CLICK_FN);
    expect(first.branch).toBe("create");
    const calendarPage = await newPagePromise;
    await calendarPage.waitForLoadState("load");
    expect(calendarPage.url()).toContain("src/calendar/calendar.html");

    const afterFirst = handle.ctx.pages().length;
    expect(afterFirst).toBe(initial + 1);
  });

  // 차단: 본 spec 12 인프라가 발견한 spec 01 회귀.
  // service-worker.js L803의 chrome.action.onClicked 핸들러가
  // `chrome.tabs.query({ url: calendarUrl })` 로 기존 탭 dedupe를 시도하지만,
  // manifest.json의 permissions에 "tabs"가 빠져 있어 chrome.tabs.query 결과의
  // url 필드가 항상 빈 값으로 채워진다. 결과: dedupe가 실패하고 매번 새 탭이 열림.
  // 수정 방향: manifest.json permissions에 "tabs" 추가 또는
  // `chrome.tabs.query` 대신 chrome.storage 기반 tab id 추적.
  test("second click reuses existing calendar tab — blocked by spec 01 regression", async () => {
    handle = await launch();
    await stubIdentity(handle.ctx);
    await routeGoogle(handle.ctx, { events: { kind: "calendar#events", items: [] } });

    const newPagePromise = handle.ctx.waitForEvent("page", { timeout: 10_000 });
    await swEval(handle.ctx, CLICK_FN);
    const calendarPage = await newPagePromise;
    await calendarPage.waitForLoadState("load");

    const afterFirst = handle.ctx.pages().length;
    const second = await swEval(handle.ctx, CLICK_FN);
    expect(second.branch).toBe("update");

    await calendarPage.waitForTimeout(300);
    expect(handle.ctx.pages().length).toBe(afterFirst);
  });
});
