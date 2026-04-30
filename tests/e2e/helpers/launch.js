"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("@playwright/test");

const EXT_ROOT = path.resolve(__dirname, "..", "..", "..");
const HEADLESS = process.env.HEADLESS === "1";

async function launch(opts = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-soma-"));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    // headless: true 는 chrome-headless-shell(extensions 미지원)을 사용하므로
    // HEADLESS 모드에서도 chromium full binary + --headless=new 플래그로 강제
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: [
      `--disable-extensions-except=${EXT_ROOT}`,
      `--load-extension=${EXT_ROOT}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-blink-features=AutomationControlled",
      ...(HEADLESS ? ["--headless=new"] : []),
    ],
    timeout: 30_000,
    ...opts.contextOptions,
  });

  let sw = ctx.serviceWorkers()[0];
  if (!sw) {
    // headless='new' 에서 MV3 SW가 lazy-start됨.
    // waitForEvent("serviceworker")는 이미 등록된 SW를 놓칠 수 있으므로
    // navigate trigger + polling 병행으로 SW 등록 대기
    const triggerPage = await ctx.newPage();
    await triggerPage.goto("about:blank");

    const deadline = Date.now() + 30_000;
    while (!sw && Date.now() < deadline) {
      sw = ctx.serviceWorkers()[0];
      if (!sw) await new Promise((r) => setTimeout(r, 200));
    }

    await triggerPage.close();

    if (!sw) {
      throw new Error("Service worker did not register within 30s");
    }
  }

  const extId = new URL(sw.url()).host;

  const cleanup = async () => {
    try {
      await ctx.close();
    } catch {
      // ignore
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  return { ctx, sw, extId, userDataDir, cleanup };
}

module.exports = { launch, EXT_ROOT, HEADLESS };
