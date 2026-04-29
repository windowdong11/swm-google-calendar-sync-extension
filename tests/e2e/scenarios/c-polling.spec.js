"use strict";

const { test, expect } = require("@playwright/test");
const { launch } = require("../helpers/launch");
const { routeSoma } = require("../helpers/route-soma");
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
});
