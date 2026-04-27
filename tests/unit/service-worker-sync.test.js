const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../..");

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function emptyResponse(status = 204) {
  return new Response(null, { status });
}

function buildManagedGoogleEvent(lecture, id) {
  return {
    id,
    status: "confirmed",
    summary: lecture.place ? `${lecture.place}-${lecture.title}` : lecture.title,
    location: lecture.place || "",
    description: lecture.detailUrl ? `SOMA 특강 신청 일정\n${lecture.detailUrl}` : "SOMA 특강 신청 일정",
    htmlLink: `https://calendar.google.com/calendar/u/0/r/eventedit/${id}`,
    extendedProperties: {
      private: {
        somaManaged: "1",
        somaQustnrSn: lecture.qustnrSn,
        somaLectureTitle: lecture.title,
        somaPlace: lecture.place || "",
        somaDetailUrl: lecture.detailUrl || ""
      }
    },
    start: {
      dateTime: lecture.startAt,
      timeZone: "Asia/Seoul"
    },
    end: {
      dateTime: lecture.endAt,
      timeZone: "Asia/Seoul"
    }
  };
}

function makeLecture(overrides = {}) {
  return {
    qustnrSn: "50001",
    title: "[예시] 동기화 특강",
    place: "온라인",
    startAt: "2026-04-22T10:00:00+09:00",
    endAt: "2026-04-22T12:00:00+09:00",
    detailUrl: "https://www.swmaestro.ai/sw/mypage/mentoLec/view.do?qustnrSn=50001",
    ...overrides
  };
}

function makeHarness({ initialMappings = {}, initialEvents = {} } = {}) {
  const serviceWorkerPath = path.join(ROOT, "src/background/service-worker.js");
  const source = fs.readFileSync(serviceWorkerPath, "utf8");
  const mappings = { ...initialMappings };
  const events = { ...initialEvents };
  let messageListener = null;
  let createdSeq = 1;
  const fetchCalls = [];

  const chrome = {
    runtime: {
      id: "test-extension-id",
      onInstalled: {
        addListener() {}
      },
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        }
      }
    },
    storage: {
      sync: {
        async get() {
          return {
            userSettings: {
              backToBackMinutes: 15,
              allowDirectDelete: false,
              confirmBeforeDelete: true,
              includeTransparentEvents: false,
              selectedCalendarIds: ["primary"]
            }
          };
        },
        async set() {}
      },
      local: {
        async get(key) {
          return {
            [key]: mappings
          };
        },
        async set(payload) {
          Object.keys(mappings).forEach((key) => delete mappings[key]);
          Object.assign(mappings, payload.lectureEventMappings || {});
        }
      }
    },
    identity: {
      async getAuthToken() {
        return { token: "test-token" };
      },
      async removeCachedAuthToken() {}
    }
  };

  async function fetchMock(input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = init.method || "GET";
    fetchCalls.push({ method, url: url.toString() });

    if (!url.hostname.includes("googleapis.com")) {
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const eventId = parts.length > 5 ? decodeURIComponent(parts[5]) : "";
    const isEventsCollection = parts.at(-1) === "events";

    if (method === "GET" && eventId) {
      const event = events[eventId];
      return event ? jsonResponse(event) : jsonResponse({ error: "not found" }, 404);
    }

    if (method === "GET" && isEventsCollection) {
      const privateProperty = url.searchParams.get("privateExtendedProperty") || "";
      const qustnrSn = privateProperty.match(/^somaQustnrSn=(.+)$/)?.[1] || "";
      const items = Object.values(events).filter((event) => {
        if (!qustnrSn) return true;
        return event.extendedProperties?.private?.somaQustnrSn === qustnrSn;
      });
      return jsonResponse({ items });
    }

    if (method === "POST" && isEventsCollection) {
      const body = JSON.parse(init.body);
      const id = `created-${createdSeq++}`;
      const event = {
        id,
        status: "confirmed",
        htmlLink: `https://calendar.google.com/calendar/u/0/r/eventedit/${id}`,
        ...body
      };
      events[id] = event;
      return jsonResponse(event, 200);
    }

    if (method === "PATCH" && eventId) {
      const body = JSON.parse(init.body);
      events[eventId] = {
        ...events[eventId],
        ...body,
        id: eventId
      };
      return jsonResponse(events[eventId]);
    }

    if (method === "DELETE" && eventId) {
      if (!events[eventId]) {
        return jsonResponse({ error: "not found" }, 404);
      }
      delete events[eventId];
      return emptyResponse();
    }

    throw new Error(`Unhandled Google API request: ${method} ${url.toString()}`);
  }

  const context = {
    chrome,
    console: {
      error() {},
      group() {},
      groupEnd() {},
      info() {},
      log() {},
      table() {},
      warn() {}
    },
    fetch: fetchMock,
    navigator: { userAgent: "Chrome" },
    URL,
    URLSearchParams,
    Response
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: serviceWorkerPath });

  assert.equal(typeof messageListener, "function");

  async function sendMessage(message) {
    return new Promise((resolve) => {
      const keepAlive = messageListener(message, {}, resolve);
      assert.equal(keepAlive, true);
    });
  }

  return {
    events,
    fetchCalls,
    mappings,
    sendMessage
  };
}

test("SYNC_SOURCE_LECTURES creates a Calendar event when an active lecture is missing", async () => {
  const lecture = makeLecture();
  const harness = makeHarness();

  const response = await harness.sendMessage({
    type: "SYNC_SOURCE_LECTURES",
    payload: {
      lectures: [lecture],
      inactiveLectures: [],
      sourceComplete: true
    }
  });

  assert.equal(response.ok, true);
  assert.equal(response.stats.created, 1);
  assert.equal(Object.keys(harness.events).length, 1);
  assert.equal(harness.mappings[lecture.qustnrSn].eventId, "created-1");
  assert.equal(harness.events["created-1"].extendedProperties.private.somaManaged, "1");
});

test("SYNC_SOURCE_LECTURES recreates an event when lecture connection info points to a missing Calendar event", async () => {
  const lecture = makeLecture();
  const harness = makeHarness({
    initialMappings: {
      [lecture.qustnrSn]: {
        calendarId: "primary",
        eventId: "missing-event",
        qustnrSn: lecture.qustnrSn,
        title: lecture.title,
        place: lecture.place,
        summary: `${lecture.place}-${lecture.title}`,
        startAt: lecture.startAt,
        endAt: lecture.endAt,
        detailUrl: lecture.detailUrl
      }
    }
  });

  const response = await harness.sendMessage({
    type: "SYNC_SOURCE_LECTURES",
    payload: {
      lectures: [lecture],
      inactiveLectures: [],
      sourceComplete: true
    }
  });

  assert.equal(response.ok, true);
  assert.equal(response.stats.created, 1);
  assert.equal(harness.mappings[lecture.qustnrSn].eventId, "created-1");
  assert.ok(harness.fetchCalls.some((call) => call.method === "GET" && call.url.includes("missing-event")));
});

test("SYNC_SOURCE_LECTURES deletes a remaining Calendar event for a cancelled lecture", async () => {
  const lecture = makeLecture();
  const event = buildManagedGoogleEvent(lecture, "existing-event");
  const harness = makeHarness({
    initialEvents: {
      [event.id]: event
    },
    initialMappings: {
      [lecture.qustnrSn]: {
        calendarId: "primary",
        eventId: event.id,
        qustnrSn: lecture.qustnrSn,
        title: lecture.title,
        place: lecture.place,
        summary: `${lecture.place}-${lecture.title}`,
        startAt: lecture.startAt,
        endAt: lecture.endAt,
        detailUrl: lecture.detailUrl
      }
    }
  });

  const response = await harness.sendMessage({
    type: "SYNC_SOURCE_LECTURES",
    payload: {
      lectures: [],
      inactiveLectures: [lecture],
      sourceComplete: true
    }
  });

  assert.equal(response.ok, true);
  assert.equal(response.stats.deleted, 1);
  assert.equal(harness.events[event.id], undefined);
  assert.equal(harness.mappings[lecture.qustnrSn], undefined);
});

test("SYNC_SOURCE_LECTURES keeps final active state when active and cancelled rows coexist", async () => {
  const lecture = makeLecture();
  const event = buildManagedGoogleEvent(lecture, "old-event");
  const harness = makeHarness({
    initialEvents: {
      [event.id]: event
    },
    initialMappings: {
      [lecture.qustnrSn]: {
        calendarId: "primary",
        eventId: event.id,
        qustnrSn: lecture.qustnrSn,
        title: lecture.title,
        place: lecture.place,
        summary: `${lecture.place}-${lecture.title}`,
        startAt: lecture.startAt,
        endAt: lecture.endAt,
        detailUrl: lecture.detailUrl
      }
    }
  });

  const response = await harness.sendMessage({
    type: "SYNC_SOURCE_LECTURES",
    payload: {
      lectures: [lecture],
      inactiveLectures: [lecture],
      sourceComplete: true
    }
  });

  assert.equal(response.ok, true);
  assert.equal(response.stats.deleted, 1);
  assert.equal(response.stats.created, 1);
  assert.equal(harness.events["old-event"], undefined);
  assert.equal(harness.mappings[lecture.qustnrSn].eventId, "created-1");
  assert.equal(harness.events["created-1"].extendedProperties.private.somaQustnrSn, lecture.qustnrSn);
});
