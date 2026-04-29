"use strict";

/**
 * Service worker 동작 wrapper.
 *
 * MV3 service worker는 ~30초 idle 후 종료될 수 있다. wakeSw()는 sendMessage가
 * SW를 깨우는 부수효과를 활용해 강제 부팅하고, swEval()은 호출 직전에 wakeSw로
 * 보장한다.
 */

async function wakeSw(ctx) {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) {
    sw = await ctx.waitForEvent("serviceworker", { timeout: 10_000 });
  }
  return sw;
}

async function swEval(ctx, fn, arg) {
  const sw = await wakeSw(ctx);
  return sw.evaluate(fn, arg);
}

async function swSetStorage(ctx, area, obj) {
  return swEval(
    ctx,
    async ({ a, o }) => chrome.storage[a].set(o),
    { a: area, o: obj }
  );
}

async function swGetStorage(ctx, area, keys) {
  return swEval(
    ctx,
    async ({ a, k }) => chrome.storage[a].get(k),
    { a: area, k: keys }
  );
}

/**
 * SW가 자기 자신에게 chrome.runtime.sendMessage 를 호출하면
 * "Receiving end does not exist" 가 떠서 응답을 못 받는다.
 * 임시 chrome-extension:// 페이지를 통해 메시지를 보내는 우회 헬퍼.
 */
async function swSendMessage(ctx, extId, message) {
  const url = `chrome-extension://${extId}/src/background/offscreen.html`;
  // offscreen.html이 chrome-extension URL로 직접 접근 가능한 페이지인지는 manifest에 따라 다름.
  // 안전하게 calendar.html을 사용한다.
  const page = await ctx.newPage();
  try {
    await page.goto(`chrome-extension://${extId}/src/calendar/calendar.html`, {
      waitUntil: "domcontentloaded",
    });
    return await page.evaluate(
      async (m) => chrome.runtime.sendMessage(m),
      message
    );
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * chrome.action.onClicked의 등록된 listener를 SW context에서 직접 호출.
 * Playwright는 toolbar 아이콘 자체를 클릭할 수 없어 우회.
 */
async function swDispatchActionClick(ctx) {
  return swEval(ctx, async () => {
    const listeners =
      (chrome.action.onClicked.getListeners && chrome.action.onClicked.getListeners()) ||
      [];
    if (listeners.length > 0) {
      const fakeTab = { id: -1 };
      await Promise.all(listeners.map((fn) => fn(fakeTab)));
      return { ok: true, count: listeners.length };
    }
    if (typeof chrome.action.onClicked.callListeners === "function") {
      await chrome.action.onClicked.callListeners({ id: -1 });
      return { ok: true, count: 1 };
    }
    return { ok: false, count: 0, error: "no listener access" };
  });
}

module.exports = {
  wakeSw,
  swEval,
  swSetStorage,
  swGetStorage,
  swSendMessage,
  swDispatchActionClick,
};
