(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.SomaPolling = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ALARM_KEY = "soma-polling";
  const MAX_BACKOFF_FAILURES = 5;
  const BACKOFF_SEQUENCE_MINUTES = [1, 5, 15, 60, 60];

  const DEFAULT_POLLING_SETTINGS = {
    enabled: false,
    intervalMinutes: 10,
    rangeDays: 30
  };

  const DEFAULT_POLLING_STATE = {
    lastPolledAt: null,
    lastSuccessAt: null,
    lastError: null,
    consecutiveFailures: 0,
    pausedReason: null
  };

  function nextBackoffMinutes(consecutiveFailures) {
    const safeIndex = Math.min(
      Math.max(0, Number.isFinite(consecutiveFailures) ? consecutiveFailures : 0),
      BACKOFF_SEQUENCE_MINUTES.length - 1
    );
    return BACKOFF_SEQUENCE_MINUTES[safeIndex];
  }

  async function readSettings(chromeApi) {
    const got = await chromeApi.storage.sync.get("pollingSettings");
    return { ...DEFAULT_POLLING_SETTINGS, ...(got.pollingSettings || {}) };
  }

  async function writeSettings(chromeApi, next) {
    await chromeApi.storage.sync.set({ pollingSettings: next });
  }

  async function readState(chromeApi) {
    const got = await chromeApi.storage.local.get("pollingState");
    return { ...DEFAULT_POLLING_STATE, ...(got.pollingState || {}) };
  }

  async function writeState(chromeApi, next) {
    await chromeApi.storage.local.set({ pollingState: next });
  }

  async function clearAlarm(chromeApi) {
    if (chromeApi.alarms?.clear) {
      await chromeApi.alarms.clear(ALARM_KEY);
    }
  }

  async function createPeriodicAlarm(chromeApi, periodInMinutes) {
    await chromeApi.alarms.create(ALARM_KEY, { periodInMinutes });
  }

  async function createOneShotAlarm(chromeApi, delayInMinutes) {
    await chromeApi.alarms.create(ALARM_KEY, { delayInMinutes });
  }

  async function registerAlarm(chromeApi) {
    const settings = await readSettings(chromeApi);
    const state = await readState(chromeApi);

    if (!settings.enabled || state.pausedReason) {
      await clearAlarm(chromeApi);
      return { scheduled: false };
    }

    await clearAlarm(chromeApi);
    await createPeriodicAlarm(chromeApi, settings.intervalMinutes);
    return { scheduled: true, periodInMinutes: settings.intervalMinutes };
  }

  function nowDate(now) {
    if (typeof now === "function") {
      const value = now();
      if (value instanceof Date) return value;
      if (typeof value === "string") {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }
    }
    return new Date();
  }

  function nowIso(now) {
    return nowDate(now).toISOString();
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function isoDate(date) {
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  }

  function computeRangeIsoDates(startDate, rangeDays) {
    const safeDays = Number.isFinite(rangeDays) && rangeDays > 0 ? rangeDays : 0;
    const end = new Date(startDate.getTime() + safeDays * 24 * 60 * 60 * 1000);
    return { rangeStart: isoDate(startDate), rangeEnd: isoDate(end) };
  }

  async function handleAlarmFire(chromeApi, deps = {}) {
    const { fetchListHtml, parseInOffscreen, now } = deps;
    if (typeof fetchListHtml !== "function") {
      throw new Error("handleAlarmFire requires fetchListHtml dep");
    }
    if (typeof parseInOffscreen !== "function") {
      throw new Error("handleAlarmFire requires parseInOffscreen dep");
    }

    const settings = await readSettings(chromeApi);
    const state = await readState(chromeApi);
    const polledAtDate = nowDate(now);
    const polledAt = polledAtDate.toISOString();
    const { rangeStart, rangeEnd } = computeRangeIsoDates(polledAtDate, settings.rangeDays);

    const fetchResult = await fetchListHtml({ rangeDays: settings.rangeDays });

    if (fetchResult.ok && fetchResult.html) {
      try {
        const parsed = await parseInOffscreen(fetchResult.html);
        const lectures = Array.isArray(parsed?.lectures) ? parsed.lectures : [];
        const snapshot = {
          takenAt: polledAt,
          rangeStart,
          rangeEnd,
          lectures
        };
        await chromeApi.storage.local.set({ lectureSnapshot: snapshot });
        await writeState(chromeApi, {
          ...state,
          lastPolledAt: polledAt,
          lastSuccessAt: polledAt,
          lastError: null,
          consecutiveFailures: 0,
          pausedReason: null
        });
        return { ok: true, lectureCount: lectures.length };
      } catch (err) {
        return await applyFailure(chromeApi, settings, state, polledAt, {
          code: "parse-failed",
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }

    if (!fetchResult.ok && fetchResult.authExpired) {
      await writeState(chromeApi, {
        ...state,
        lastPolledAt: polledAt,
        lastError: { code: "auth-expired", message: "SWM 로그인 만료", at: polledAt },
        pausedReason: "auth-expired"
      });
      await clearAlarm(chromeApi);
      return { ok: false, error: "auth-expired" };
    }

    return await applyFailure(chromeApi, settings, state, polledAt, {
      code: "fetch-failed",
      message: fetchResult.error || "fetch failed"
    });
  }

  async function applyFailure(chromeApi, settings, state, polledAt, errorPayload) {
    const consecutiveFailures = (state.consecutiveFailures || 0) + 1;
    const reachedMaxRetry = consecutiveFailures >= MAX_BACKOFF_FAILURES;

    const nextState = {
      ...state,
      lastPolledAt: polledAt,
      lastError: { code: errorPayload.code, message: errorPayload.message, at: polledAt },
      consecutiveFailures,
      pausedReason: reachedMaxRetry ? "max-retry" : state.pausedReason || null
    };
    await writeState(chromeApi, nextState);

    if (reachedMaxRetry) {
      await clearAlarm(chromeApi);
    } else if (settings.enabled) {
      await clearAlarm(chromeApi);
      await createOneShotAlarm(chromeApi, nextBackoffMinutes(consecutiveFailures - 1));
    }

    return { ok: false, error: errorPayload.message };
  }

  async function updateSettings(chromeApi, patch = {}) {
    const settings = await readSettings(chromeApi);
    const next = { ...settings, ...patch };
    await writeSettings(chromeApi, next);

    if (patch.enabled === true) {
      const state = await readState(chromeApi);
      if (state.pausedReason || state.consecutiveFailures > 0) {
        await writeState(chromeApi, {
          ...state,
          pausedReason: null,
          consecutiveFailures: 0,
          lastError: null
        });
      }
    }

    await registerAlarm(chromeApi);
    return next;
  }

  return {
    ALARM_KEY,
    MAX_BACKOFF_FAILURES,
    DEFAULT_POLLING_SETTINGS,
    DEFAULT_POLLING_STATE,
    nextBackoffMinutes,
    registerAlarm,
    handleAlarmFire,
    updateSettings,
    readSettings,
    readState
  };
});
