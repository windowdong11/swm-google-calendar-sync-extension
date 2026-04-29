const assert = require("node:assert/strict");
const test = require("node:test");

const Polling = require("../../src/background/polling.js");

function makeChromeMock({ pollingSettings, pollingState, lectureSnapshot } = {}) {
  const sync = { pollingSettings: pollingSettings ? { ...pollingSettings } : undefined };
  const local = {
    pollingState: pollingState ? { ...pollingState } : undefined,
    lectureSnapshot: lectureSnapshot ? { ...lectureSnapshot } : undefined
  };

  const alarms = {
    created: [],
    cleared: [],
    async create(name, info) {
      this.created.push({ name, info });
    },
    async clear(name) {
      this.cleared.push(name);
      return true;
    }
  };

  const chromeApi = {
    storage: {
      sync: {
        async get(key) {
          if (Array.isArray(key)) {
            const out = {};
            for (const k of key) out[k] = sync[k];
            return out;
          }
          if (typeof key === "string") return { [key]: sync[key] };
          return { ...sync };
        },
        async set(payload) {
          Object.assign(sync, payload);
        }
      },
      local: {
        async get(key) {
          if (Array.isArray(key)) {
            const out = {};
            for (const k of key) out[k] = local[k];
            return out;
          }
          if (typeof key === "string") return { [key]: local[key] };
          return { ...local };
        },
        async set(payload) {
          Object.assign(local, payload);
        }
      }
    },
    alarms
  };

  return { chrome: chromeApi, store: { sync, local }, alarms };
}

test("nextBackoffMinutes follows the documented sequence then caps at 60", () => {
  assert.equal(Polling.nextBackoffMinutes(0), 1);
  assert.equal(Polling.nextBackoffMinutes(1), 5);
  assert.equal(Polling.nextBackoffMinutes(2), 15);
  assert.equal(Polling.nextBackoffMinutes(3), 60);
  assert.equal(Polling.nextBackoffMinutes(4), 60);
  assert.equal(Polling.nextBackoffMinutes(5), 60);
  assert.equal(Polling.nextBackoffMinutes(99), 60);
});

test("MAX_BACKOFF_FAILURES is 5", () => {
  assert.equal(Polling.MAX_BACKOFF_FAILURES, 5);
});

test("DEFAULT_POLLING_SETTINGS matches spec defaults", () => {
  assert.deepEqual(Polling.DEFAULT_POLLING_SETTINGS, {
    enabled: false,
    intervalMinutes: 10,
    rangeDays: 30
  });
});

test("DEFAULT_POLLING_STATE has zeroed counters", () => {
  assert.deepEqual(Polling.DEFAULT_POLLING_STATE, {
    lastPolledAt: null,
    lastSuccessAt: null,
    lastError: null,
    consecutiveFailures: 0,
    pausedReason: null
  });
});

test("registerAlarm clears alarm when polling is disabled", async () => {
  const { chrome, alarms } = makeChromeMock({
    pollingSettings: { enabled: false, intervalMinutes: 10, rangeDays: 30 }
  });

  await Polling.registerAlarm(chrome);

  assert.deepEqual(alarms.cleared, [Polling.ALARM_KEY]);
  assert.equal(alarms.created.length, 0);
});

test("registerAlarm creates alarm when enabled and not paused", async () => {
  const { chrome, alarms } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE }
  });

  await Polling.registerAlarm(chrome);

  assert.equal(alarms.created.length, 1);
  assert.equal(alarms.created[0].name, Polling.ALARM_KEY);
  assert.equal(alarms.created[0].info.periodInMinutes, 10);
});

test("registerAlarm clears alarm when paused", async () => {
  const { chrome, alarms } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE, pausedReason: "auth-expired" }
  });

  await Polling.registerAlarm(chrome);

  assert.deepEqual(alarms.cleared, [Polling.ALARM_KEY]);
  assert.equal(alarms.created.length, 0);
});

test("handleAlarmFire on success stores snapshot and resets failures", async () => {
  const { chrome, store } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE, consecutiveFailures: 2 }
  });

  const lectures = [{ id: "1", title: "ok", startAt: "2026-04-30T10:00:00+09:00", endAt: "2026-04-30T12:00:00+09:00" }];
  let parseCallCount = 0;
  const deps = {
    fetchListHtml: async () => ({ ok: true, html: "<html></html>" }),
    parseInOffscreen: async () => {
      parseCallCount += 1;
      return { lectures: parseCallCount === 1 ? lectures : [] };
    },
    now: () => new Date("2026-04-29T08:00:00.000Z")
  };

  const result = await Polling.handleAlarmFire(chrome, deps);

  assert.equal(result.ok, true);
  assert.equal(result.lectureCount, 1);
  assert.equal(store.local.lectureSnapshot.lectures.length, 1);
  assert.equal(store.local.pollingState.consecutiveFailures, 0);
  assert.equal(store.local.pollingState.lastError, null);
  assert.equal(store.local.pollingState.lastSuccessAt, "2026-04-29T08:00:00.000Z");
  assert.equal(store.local.pollingState.lastPolledAt, "2026-04-29T08:00:00.000Z");
  assert.equal(store.local.pollingState.pausedReason, null);
});

test("handleAlarmFire on auth-expired pauses polling and clears alarm", async () => {
  const { chrome, store, alarms } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE }
  });

  const deps = {
    fetchListHtml: async () => ({ ok: false, authExpired: true }),
    parseInOffscreen: async () => ({ lectures: [] }),
    now: () => new Date("2026-04-29T08:00:00.000Z")
  };

  const result = await Polling.handleAlarmFire(chrome, deps);

  assert.equal(result.ok, false);
  assert.equal(store.local.pollingState.pausedReason, "auth-expired");
  assert.ok(alarms.cleared.includes(Polling.ALARM_KEY));
});

test("handleAlarmFire on generic failure increments failures and reschedules with backoff", async () => {
  const { chrome, store, alarms } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE, consecutiveFailures: 2 }
  });

  const deps = {
    fetchListHtml: async () => ({ ok: false, error: "network down" }),
    parseInOffscreen: async () => ({ lectures: [] }),
    now: () => new Date("2026-04-29T08:00:00.000Z")
  };

  const result = await Polling.handleAlarmFire(chrome, deps);

  assert.equal(result.ok, false);
  assert.equal(store.local.pollingState.consecutiveFailures, 3);
  assert.equal(store.local.pollingState.pausedReason, null);
  const created = alarms.created.find((a) => a.name === Polling.ALARM_KEY);
  assert.ok(created, "alarm should be rescheduled");
  assert.equal(created.info.delayInMinutes, 15);
});

test("handleAlarmFire pauses with max-retry once consecutiveFailures hits 5", async () => {
  const { chrome, store, alarms } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE, consecutiveFailures: 4 }
  });

  const deps = {
    fetchListHtml: async () => ({ ok: false, error: "still down" }),
    parseInOffscreen: async () => ({ lectures: [] }),
    now: () => new Date("2026-04-29T08:00:00.000Z")
  };

  const result = await Polling.handleAlarmFire(chrome, deps);

  assert.equal(result.ok, false);
  assert.equal(store.local.pollingState.consecutiveFailures, 5);
  assert.equal(store.local.pollingState.pausedReason, "max-retry");
  assert.ok(alarms.cleared.includes(Polling.ALARM_KEY));
});

test("updateSettings merges patch and re-registers alarm", async () => {
  const { chrome, store, alarms } = makeChromeMock({
    pollingSettings: { enabled: false, intervalMinutes: 10, rangeDays: 30 }
  });

  await Polling.updateSettings(chrome, { enabled: true, intervalMinutes: 5 });

  assert.deepEqual(store.sync.pollingSettings, {
    enabled: true,
    intervalMinutes: 5,
    rangeDays: 30
  });
  assert.equal(alarms.created.length, 1);
  assert.equal(alarms.created[0].info.periodInMinutes, 5);
});

test("updateSettings clears pausedReason when re-enabling polling", async () => {
  const { chrome, store } = makeChromeMock({
    pollingSettings: { enabled: false, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE, pausedReason: "auth-expired", consecutiveFailures: 3 }
  });

  await Polling.updateSettings(chrome, { enabled: true });

  assert.equal(store.local.pollingState.pausedReason, null);
  assert.equal(store.local.pollingState.consecutiveFailures, 0);
});

test("handleAlarmFire reschedules with 1m backoff after first failure (counter 0 -> 1)", async () => {
  const { chrome, alarms } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE }
  });

  const deps = {
    fetchListHtml: async () => ({ ok: false, error: "boom" }),
    parseInOffscreen: async () => ({ lectures: [] }),
    now: () => new Date("2026-04-29T08:00:00.000Z")
  };

  await Polling.handleAlarmFire(chrome, deps);

  const created = alarms.created.find((a) => a.name === Polling.ALARM_KEY);
  assert.equal(created.info.delayInMinutes, 1);
});

test("handleAlarmFire reschedules with 5m backoff after second failure (counter 1 -> 2)", async () => {
  const { chrome, alarms } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE, consecutiveFailures: 1 }
  });

  await Polling.handleAlarmFire(chrome, {
    fetchListHtml: async () => ({ ok: false, error: "boom" }),
    parseInOffscreen: async () => ({ lectures: [] }),
    now: () => new Date("2026-04-29T08:00:00.000Z")
  });

  const created = alarms.created.find((a) => a.name === Polling.ALARM_KEY);
  assert.equal(created.info.delayInMinutes, 5);
});

test("handleAlarmFire reschedules with 60m backoff after fourth failure (counter 3 -> 4)", async () => {
  const { chrome, alarms } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE, consecutiveFailures: 3 }
  });

  await Polling.handleAlarmFire(chrome, {
    fetchListHtml: async () => ({ ok: false, error: "boom" }),
    parseInOffscreen: async () => ({ lectures: [] }),
    now: () => new Date("2026-04-29T08:00:00.000Z")
  });

  const created = alarms.created.find((a) => a.name === Polling.ALARM_KEY);
  assert.equal(created.info.delayInMinutes, 60);
});

test("handleAlarmFire records lastError on failure with code and message", async () => {
  const { chrome, store } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE }
  });

  await Polling.handleAlarmFire(chrome, {
    fetchListHtml: async () => ({ ok: false, error: "HTTP 503" }),
    parseInOffscreen: async () => ({ lectures: [] }),
    now: () => new Date("2026-04-29T08:00:00.000Z")
  });

  assert.equal(store.local.pollingState.lastError.code, "fetch-failed");
  assert.equal(store.local.pollingState.lastError.message, "HTTP 503");
  assert.equal(store.local.pollingState.lastError.at, "2026-04-29T08:00:00.000Z");
});

test("handleAlarmFire treats parse error as a failure increment", async () => {
  const { chrome, store } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE, consecutiveFailures: 0 }
  });

  await Polling.handleAlarmFire(chrome, {
    fetchListHtml: async () => ({ ok: true, html: "<html></html>" }),
    parseInOffscreen: async () => {
      throw new Error("parser blew up");
    },
    now: () => new Date("2026-04-29T08:00:00.000Z")
  });

  assert.equal(store.local.pollingState.consecutiveFailures, 1);
  assert.equal(store.local.pollingState.lastError.code, "parse-failed");
  assert.match(store.local.pollingState.lastError.message, /parser blew up/);
});

test("handleAlarmFire does not reschedule when polling is disabled", async () => {
  const { chrome, alarms } = makeChromeMock({
    pollingSettings: { enabled: false, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE }
  });

  await Polling.handleAlarmFire(chrome, {
    fetchListHtml: async () => ({ ok: false, error: "boom" }),
    parseInOffscreen: async () => ({ lectures: [] }),
    now: () => new Date("2026-04-29T08:00:00.000Z")
  });

  assert.equal(alarms.created.length, 0);
});

test("handleAlarmFire stores rangeDays-aware snapshot metadata on success", async () => {
  const { chrome, store } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 14 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE }
  });

  let capturedRangeDays;
  await Polling.handleAlarmFire(chrome, {
    fetchListHtml: async ({ rangeDays }) => {
      capturedRangeDays = rangeDays;
      return { ok: true, html: "<html></html>" };
    },
    parseInOffscreen: async () => ({ lectures: [] }),
    now: () => new Date("2026-04-29T08:00:00.000Z")
  });

  assert.equal(capturedRangeDays, 14);
  assert.equal(store.local.lectureSnapshot.takenAt, "2026-04-29T08:00:00.000Z");
});

test("handleAlarmFire writes ISO date rangeStart/rangeEnd derived from rangeDays", async () => {
  const { chrome, store } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE }
  });

  await Polling.handleAlarmFire(chrome, {
    fetchListHtml: async () => ({ ok: true, html: "<html></html>" }),
    parseInOffscreen: async () => ({ lectures: [] }),
    now: () => new Date("2026-04-29T08:00:00.000Z")
  });

  const snapshot = store.local.lectureSnapshot;
  assert.match(snapshot.rangeStart, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(snapshot.rangeEnd, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(snapshot.rangeStart, "2026-04-29");
  assert.equal(snapshot.rangeEnd, "2026-05-29");
});

test("handleAlarmFire honors rangeDays=7 for rangeEnd ISO date", async () => {
  const { chrome, store } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 7 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE }
  });

  await Polling.handleAlarmFire(chrome, {
    fetchListHtml: async () => ({ ok: true, html: "<html></html>" }),
    parseInOffscreen: async () => ({ lectures: [] }),
    now: () => new Date("2026-04-29T00:00:00.000Z")
  });

  const snapshot = store.local.lectureSnapshot;
  assert.equal(snapshot.rangeStart, "2026-04-29");
  assert.equal(snapshot.rangeEnd, "2026-05-06");
});

test("handleAlarmFire fetches pages 1,2,3 then stops on empty page 4", async () => {
  const { chrome, store } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE }
  });

  const fetchedPageIndexes = [];
  let parseCallCount = 0;
  const pageData = [
    [{ id: "1", title: "A" }],
    [{ id: "2", title: "B" }],
    [{ id: "3", title: "C" }],
    []
  ];

  const result = await Polling.handleAlarmFire(chrome, {
    fetchListHtml: async ({ pageIndex }) => {
      fetchedPageIndexes.push(pageIndex);
      return { ok: true, html: "<html></html>" };
    },
    parseInOffscreen: async () => {
      const data = pageData[parseCallCount] || [];
      parseCallCount += 1;
      return { lectures: data };
    },
    now: () => new Date("2026-04-29T08:00:00.000Z")
  });

  assert.deepEqual(fetchedPageIndexes, [1, 2, 3, 4]);
  assert.equal(result.ok, true);
  assert.equal(result.lectureCount, 3);
  assert.equal(store.local.lectureSnapshot.lectures.length, 3);
});

test("handleAlarmFire passes scdate and ecdate derived from rangeStart/rangeEnd to fetchListHtml", async () => {
  const { chrome } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE }
  });

  const fetchCalls = [];
  let parseCallCount = 0;

  await Polling.handleAlarmFire(chrome, {
    fetchListHtml: async (opts) => {
      fetchCalls.push({ scdate: opts.scdate, ecdate: opts.ecdate, pageIndex: opts.pageIndex });
      return { ok: true, html: "<html></html>" };
    },
    parseInOffscreen: async () => {
      parseCallCount += 1;
      return { lectures: parseCallCount === 1 ? [{ id: "x" }] : [] };
    },
    now: () => new Date("2026-04-29T08:00:00.000Z")
  });

  assert.equal(fetchCalls[0].scdate, "2026-04-29");
  assert.equal(fetchCalls[0].ecdate, "2026-05-29");
  assert.equal(fetchCalls[0].pageIndex, 1);
  assert.equal(fetchCalls[1].pageIndex, 2);
});

test("handleAlarmFire stops at MAX_PAGES cap and warns", async () => {
  const { chrome, store } = makeChromeMock({
    pollingSettings: { enabled: true, intervalMinutes: 10, rangeDays: 30 },
    pollingState: { ...Polling.DEFAULT_POLLING_STATE }
  });

  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));

  const fetchedCount = { value: 0 };
  try {
    const result = await Polling.handleAlarmFire(chrome, {
      fetchListHtml: async ({ pageIndex }) => {
        fetchedCount.value = pageIndex;
        return { ok: true, html: "<html></html>" };
      },
      parseInOffscreen: async () => ({ lectures: [{ id: String(fetchedCount.value) }] }),
      now: () => new Date("2026-04-29T08:00:00.000Z")
    });

    assert.equal(result.ok, true);
    assert.equal(result.lectureCount, Polling.MAX_PAGES);
    assert.equal(fetchedCount.value, Polling.MAX_PAGES);
    assert.ok(warnings.some((w) => /MAX_PAGES/.test(w)), "should warn about MAX_PAGES cap");
  } finally {
    console.warn = origWarn;
  }
});
