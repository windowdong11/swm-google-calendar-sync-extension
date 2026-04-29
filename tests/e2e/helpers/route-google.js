"use strict";

const path = require("path");
const fs = require("fs");

const DEFAULT_EVENTS_PATH = path.resolve(__dirname, "..", "fixtures", "google-events.json");

/**
 * Google Calendar API 호출을 ctx 단위로 가로채 fixture로 응답한다.
 *
 * - GET /calendar/v3/calendars/{id}/events  → events 배열 (fixture)
 * - 그 외 (calendarList 등)  → 빈 객체
 *
 * service-worker.js의 fetch는 BrowserContext의 route 핸들러로 잡힌다
 * (Playwright가 SW 트래픽도 가로챔).
 */
async function routeGoogle(ctx, opts = {}) {
  const events = opts.events || JSON.parse(fs.readFileSync(DEFAULT_EVENTS_PATH, "utf8"));

  await ctx.route("https://www.googleapis.com/**", async (route) => {
    const url = route.request().url();
    if (/\/calendar\/v3\/calendars\/[^/]+\/events(\?|$)/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(events),
      });
      return;
    }
    if (/\/calendar\/v3\/calendars\/[^/]+\/events\/[^/]+/.test(url)) {
      const method = route.request().method();
      if (method === "DELETE") {
        await route.fulfill({ status: 204, body: "" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ id: "evt-fake", status: "confirmed" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: "{}",
    });
  });
}

module.exports = { routeGoogle, DEFAULT_EVENTS_PATH };
