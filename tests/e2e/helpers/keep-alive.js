"use strict";

const { wakeSw } = require("./sw");

/**
 * 주기적으로 service worker에 ping을 보내 idle termination(~30s)을 회피한다.
 * stop 함수를 반환하므로 시나리오 종료 시 호출.
 */
function startKeepAlive(ctx, intervalMs = 20_000) {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const sw = await wakeSw(ctx);
      await sw.evaluate(() =>
        typeof chrome.runtime.getPlatformInfo === "function"
          ? chrome.runtime.getPlatformInfo()
          : null
      );
    } catch {
      // SW가 잠시 죽었을 수 있음 — 다음 tick에서 다시 깨움
    }
    if (!stopped) setTimeout(tick, intervalMs);
  };
  setTimeout(tick, intervalMs);
  return () => {
    stopped = true;
  };
}

module.exports = { startKeepAlive };
