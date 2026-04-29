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
    headless: HEADLESS,
    viewport: { width: 1280, height: 900 },
    args: [
      `--disable-extensions-except=${EXT_ROOT}`,
      `--load-extension=${EXT_ROOT}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-blink-features=AutomationControlled",
    ],
    timeout: 30_000,
    ...opts.contextOptions,
  });

  let sw = ctx.serviceWorkers()[0];
  if (!sw) {
    sw = await ctx.waitForEvent("serviceworker", { timeout: 15_000 });
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
