if (typeof importScripts === "function") {
  importScripts("polling.js", "swm-fetch.js");
}

const DEFAULT_SETTINGS = {
  backToBackMinutes: 15,
  allowDirectDelete: false,
  confirmBeforeDelete: true,
  includeTransparentEvents: false,
  selectedCalendarIds: ["primary"]
};

const OFFSCREEN_DOCUMENT_PATH = "src/background/offscreen.html";
const OFFSCREEN_IDLE_MS = 5 * 60 * 1000;
let offscreenIdleTimer = null;

async function hasOffscreenDocument() {
  if (!chrome.offscreen?.hasDocument) return false;
  try {
    return await chrome.offscreen.hasDocument();
  } catch {
    return false;
  }
}

async function ensureOffscreen() {
  if (!chrome.offscreen?.createDocument) {
    throw new Error("chrome.offscreen API가 사용 불가합니다.");
  }
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ["DOM_PARSER"],
    justification: "Parse SWM lecture list HTML using shared DOMParser-based logic"
  });
}

function scheduleOffscreenClose() {
  if (offscreenIdleTimer) {
    clearTimeout(offscreenIdleTimer);
  }
  offscreenIdleTimer = setTimeout(async () => {
    offscreenIdleTimer = null;
    try {
      if (await hasOffscreenDocument()) {
        await chrome.offscreen.closeDocument();
      }
    } catch (err) {
      console.warn("SOMA polling: failed to close offscreen document", err);
    }
  }, OFFSCREEN_IDLE_MS);
}

async function parseInOffscreen(html) {
  await ensureOffscreen();
  scheduleOffscreenClose();
  try {
    const response = await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "OFFSCREEN_PARSE_HTML",
      payload: { html }
    });
    scheduleOffscreenClose();
    if (!response || response.ok !== true) {
      throw new Error(response?.error || "Offscreen 파싱 실패");
    }
    return { lectures: response.lectures || [] };
  } catch (err) {
    scheduleOffscreenClose();
    throw err;
  }
}

async function rescheduleOffscreenCloseIfPresent() {
  try {
    if (await hasOffscreenDocument()) {
      scheduleOffscreenClose();
    }
  } catch (err) {
    console.warn("SOMA polling: failed to reschedule offscreen close on startup", err);
  }
}

async function runPollingCycle() {
  if (!globalThis.SomaPolling || !globalThis.SomaSwmFetch) {
    throw new Error("Polling 모듈이 로드되지 않았습니다.");
  }
  return globalThis.SomaPolling.handleAlarmFire(chrome, {
    fetchListHtml: globalThis.SomaSwmFetch.fetchListHtml,
    parseInOffscreen,
    now: () => new Date()
  });
}

const LECTURE_EVENT_MAPPINGS_KEY = "lectureEventMappings";

async function getSettings() {
  const result = await chrome.storage.sync.get("userSettings");
  return { ...DEFAULT_SETTINGS, ...(result.userSettings || {}) };
}

async function getLectureEventMappings() {
  const result = await chrome.storage.local.get(LECTURE_EVENT_MAPPINGS_KEY);
  return result[LECTURE_EVENT_MAPPINGS_KEY] || {};
}

async function setLectureEventMappings(mappings) {
  await chrome.storage.local.set({
    [LECTURE_EVENT_MAPPINGS_KEY]: mappings
  });
}

function pickLectureMappings(mappings, qustnrSns) {
  if (!Array.isArray(qustnrSns) || qustnrSns.length === 0) {
    return mappings;
  }

  const picked = {};
  for (const qustnrSn of qustnrSns) {
    if (qustnrSn && mappings[qustnrSn]) {
      picked[qustnrSn] = mappings[qustnrSn];
    }
  }
  return picked;
}

function normalizeAuthError(err) {
  const message = err instanceof Error ? err.message : String(err || "");
  const userAgent = navigator.userAgent || "";
  const isNonChromeChromium =
    /(Arc|Brave|Edg|Whale|OPR)/i.test(userAgent) ||
    (userAgent.includes("Chromium") && !userAgent.includes("Chrome"));

  if (
    message.includes("Custom URI scheme is not supported on Chrome apps") ||
    message.includes("invalid_request")
  ) {
    return [
      isNonChromeChromium
        ? "현재 브라우저는 Chrome Extension OAuth의 `getAuthToken()` 흐름을 안정적으로 지원하지 않습니다."
        : "Google OAuth 설정이 현재 확장 프로그램과 맞지 않습니다.",
      "이 확장은 `Chrome Extension` 타입 OAuth 클라이언트와 `chrome.identity.getAuthToken()` 기준으로 동작합니다.",
      isNonChromeChromium
        ? "Google Calendar 연결은 현재 Google Chrome에서만 지원합니다."
        : `Google Cloud Console에서 확장 프로그램 ID \`${chrome.runtime.id}\` 를 등록한 Chrome Extension OAuth 클라이언트를 사용해 주세요.`
    ].join(" ");
  }
  return message || "Google 인증 토큰을 가져오지 못했습니다.";
}

function extractToken(result) {
  if (!result) return null;
  if (typeof result === "string") return result;
  return result.token || null;
}

async function getAccessToken(interactive = false) {
  try {
    const result = await chrome.identity.getAuthToken({ interactive });
    const token = extractToken(result);
    if (!token) {
      throw new Error("No access token returned");
    }
    return token;
  } catch (err) {
    throw new Error(normalizeAuthError(err));
  }
}

async function clearCachedToken(token) {
  await chrome.identity.removeCachedAuthToken({ token });
}

async function googleFetch(url, options = {}, interactive = false) {
  let token = await getAccessToken(interactive);

  let res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  if (res.status === 401) {
    await clearCachedToken(token);
    token = await getAccessToken(false);
    res = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`
      }
    });
  }

  return res;
}

function normalizeEvent(item, calendarId) {
  if (item?.status === "cancelled") return null;
  const startAt = item?.start?.dateTime || item?.start?.date;
  const endAt = item?.end?.dateTime || item?.end?.date;
  if (!startAt || !endAt) return null;
  const privateProps = item?.extendedProperties?.private || {};
  return {
    id: item.id,
    title: item.summary || "(제목 없음)",
    startAt,
    endAt,
    htmlLink: item.htmlLink || "",
    calendarId,
    transparency: item.transparency || "opaque",
    isSomaLecture: normalizeText(privateProps.somaManaged) === "1",
    somaQustnrSn: normalizeText(privateProps.somaQustnrSn)
  };
}

async function fetchCalendarEvents(timeMin, timeMax) {
  const settings = await getSettings();
  const all = [];
  const normalizedTimeMin = normalizeCalendarDateTime(timeMin);
  const normalizedTimeMax = normalizeCalendarDateTime(timeMax);

  for (const calendarId of settings.selectedCalendarIds) {
    let pageToken = "";
    do {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
      url.searchParams.set("timeMin", normalizedTimeMin);
      url.searchParams.set("timeMax", normalizedTimeMax);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", "2500");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await googleFetch(url.toString(), {}, false);
      if (!res.ok) {
        throw new Error(`Google Calendar API 오류: ${res.status}`);
      }
      const data = await res.json();

      for (const item of data.items || []) {
        const event = normalizeEvent(item, calendarId);
        if (!event) continue;
        if (!settings.includeTransparentEvents && event.transparency === "transparent") continue;
        all.push(event);
      }

      pageToken = data.nextPageToken || "";
    } while (pageToken);
  }

  return all;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function padTwo(value) {
  return String(value).padStart(2, "0");
}

function addDaysToDateString(dateString, days) {
  const [year, month, day] = String(dateString).split("-").map((value) => Number.parseInt(value, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${padTwo(date.getUTCMonth() + 1)}-${padTwo(date.getUTCDate())}`;
}

function normalizeCalendarDateTime(value) {
  const normalized = normalizeText(value);
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})T24:00(?::00(?:\.(\d{1,3}))?)?([+-]\d{2}:\d{2}|Z)$/);

  if (!match) {
    return normalized;
  }

  const [, dateString, fractional = "", timezone] = match;
  const nextDate = addDaysToDateString(dateString, 1);
  const fraction = fractional ? `.${fractional}` : "";
  return `${nextDate}T00:00:00${fraction}${timezone}`;
}

function buildLectureSummary(title, place) {
  const normalizedTitle = normalizeText(title);
  const normalizedPlace = normalizeText(place);
  return normalizedPlace ? `${normalizedPlace}-${normalizedTitle}` : normalizedTitle;
}

function buildLectureDescription(detailUrl) {
  const normalizedUrl = normalizeText(detailUrl);
  return normalizedUrl ? `SOMA 특강 신청 일정\n${normalizedUrl}` : "SOMA 특강 신청 일정";
}

function isManagedSomaEvent(item) {
  const privateProps = item?.extendedProperties?.private || {};
  return normalizeText(privateProps.somaManaged) === "1";
}

function buildLecturePayload(input, mapping = {}) {
  const qustnrSn = normalizeText(input?.qustnrSn || mapping.qustnrSn);
  const title = normalizeText(input?.title || mapping.title);
  const place = normalizeText(input?.place || mapping.place);
  const startAt = normalizeCalendarDateTime(input?.startAt || mapping.startAt || "");
  const endAt = normalizeCalendarDateTime(input?.endAt || mapping.endAt || "");
  const detailUrl = normalizeText(input?.detailUrl || mapping.detailUrl);
  const shouldReuseMappingSummary = !input?.summary && !input?.title && !input?.place;
  const summary = normalizeText(input?.summary || (shouldReuseMappingSummary ? mapping.summary : "") || buildLectureSummary(title, place));

  if (!qustnrSn) {
    throw new Error("특강 식별자(qustnrSn)가 필요합니다.");
  }
  if (!title) {
    throw new Error("특강 제목이 필요합니다.");
  }
  if (!startAt || !endAt) {
    throw new Error("특강 시작/종료 시간이 필요합니다.");
  }

  return {
    qustnrSn,
    title,
    place,
    summary,
    detailUrl,
    startAt,
    endAt
  };
}

function buildManagedEventBody(lecture) {
  return {
    summary: lecture.summary,
    location: lecture.place || "",
    description: buildLectureDescription(lecture.detailUrl),
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
      dateTime: normalizeCalendarDateTime(lecture.startAt),
      timeZone: "Asia/Seoul"
    },
    end: {
      dateTime: normalizeCalendarDateTime(lecture.endAt),
      timeZone: "Asia/Seoul"
    }
  };
}

function eventMatchesLecture(event, lecture) {
  const privateProps = event?.extendedProperties?.private || {};
  const eventStart = event?.start?.dateTime || event?.start?.date || "";
  const eventEnd = event?.end?.dateTime || event?.end?.date || "";

  return (
    normalizeText(event?.summary) === lecture.summary &&
    normalizeText(event?.location) === normalizeText(lecture.place) &&
    normalizeText(event?.description) === normalizeText(buildLectureDescription(lecture.detailUrl)) &&
    eventStart === lecture.startAt &&
    eventEnd === lecture.endAt &&
    normalizeText(privateProps.somaQustnrSn) === lecture.qustnrSn &&
    normalizeText(privateProps.somaLectureTitle) === lecture.title &&
    normalizeText(privateProps.somaPlace) === normalizeText(lecture.place) &&
    normalizeText(privateProps.somaDetailUrl) === normalizeText(lecture.detailUrl)
  );
}

function shiftIsoString(value, offsetMs) {
  const normalizedValue = normalizeCalendarDateTime(value);
  const time = new Date(normalizedValue).getTime();
  if (Number.isNaN(time)) return normalizedValue;
  return new Date(time + offsetMs).toISOString();
}

function buildCandidateSummaries(lecture, mapping = {}) {
  const values = new Set([
    normalizeText(lecture.summary),
    normalizeText(mapping.summary),
    buildLectureSummary(lecture.title, mapping.place || ""),
    buildLectureSummary(mapping.title || "", mapping.place || "")
  ]);

  values.delete("");
  return values;
}

function isCandidateCalendarEvent(item, lecture, mapping = {}) {
  const itemStart = item?.start?.dateTime || item?.start?.date || "";
  const itemEnd = item?.end?.dateTime || item?.end?.date || "";

  if (lecture.startAt && itemStart !== lecture.startAt) return false;
  if (lecture.endAt && itemEnd !== lecture.endAt) return false;

  const privateProps = item?.extendedProperties?.private || {};
  if (normalizeText(privateProps.somaQustnrSn) === lecture.qustnrSn) {
    return true;
  }

  const summary = normalizeText(item?.summary);
  if (!summary) return false;

  const candidateSummaries = buildCandidateSummaries(lecture, mapping);
  if (isManagedSomaEvent(item) && candidateSummaries.has(summary)) {
    return true;
  }

  return (
    summary === normalizeText(lecture.summary) &&
    normalizeText(item?.location) === normalizeText(lecture.place) &&
    normalizeText(item?.description) === normalizeText(buildLectureDescription(lecture.detailUrl))
  );
}

function addUniqueEvents(target, seenIds, items, lecture, mapping = {}) {
  for (const item of items || []) {
    if (!item?.id || seenIds.has(item.id)) continue;
    if (item.status === "cancelled") continue;
    if (!isCandidateCalendarEvent(item, lecture, mapping)) continue;
    seenIds.add(item.id);
    target.push(item);
  }
}

async function fetchCalendarEventById(calendarId, eventId) {
  const res = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {},
    false
  );

  if (res.status === 404 || res.status === 410) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Google Calendar 조회 실패 (${res.status})`);
  }

  const event = await res.json();
  if (event?.status === "cancelled") {
    return null;
  }
  return event;
}

async function deleteCalendarEvent(calendarId, eventId, options = {}) {
  const res = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
    false
  );

  if ((res.status === 404 || res.status === 410) && options.ignoreNotFound) {
    return false;
  }
  if (!res.ok) {
    throw new Error(`일정 삭제 실패 (${res.status})`);
  }

  return true;
}

async function createManagedCalendarEvent(calendarId, lecture) {
  const res = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildManagedEventBody(lecture))
    },
    false
  );

  if (!res.ok) {
    throw new Error(`일정 생성 실패 (${res.status})`);
  }

  return res.json();
}

async function updateManagedCalendarEvent(calendarId, eventId, lecture) {
  const res = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildManagedEventBody(lecture))
    },
    false
  );

  if (!res.ok) {
    throw new Error(`일정 수정 실패 (${res.status})`);
  }

  return res.json();
}

async function searchLectureCandidateEvents(calendarId, lecture, mapping = {}) {
  const matches = [];
  const seenIds = new Set();

  if (lecture.qustnrSn) {
    const propertyUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    propertyUrl.searchParams.set("privateExtendedProperty", `somaQustnrSn=${lecture.qustnrSn}`);
    propertyUrl.searchParams.set("singleEvents", "true");
    propertyUrl.searchParams.set("maxResults", "50");

    const res = await googleFetch(propertyUrl.toString(), {}, false);
    if (!res.ok) {
      throw new Error(`Google Calendar 조회 실패 (${res.status})`);
    }

    const data = await res.json();
    addUniqueEvents(matches, seenIds, data.items, lecture, mapping);
  }

  const timeUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  timeUrl.searchParams.set("timeMin", shiftIsoString(lecture.startAt, -24 * 60 * 60 * 1000));
  timeUrl.searchParams.set("timeMax", shiftIsoString(lecture.endAt, 24 * 60 * 60 * 1000));
  timeUrl.searchParams.set("singleEvents", "true");
  timeUrl.searchParams.set("orderBy", "startTime");
  timeUrl.searchParams.set("maxResults", "250");

  const timeRes = await googleFetch(timeUrl.toString(), {}, false);
  if (!timeRes.ok) {
    throw new Error(`Google Calendar 조회 실패 (${timeRes.status})`);
  }

  const timeData = await timeRes.json();
  addUniqueEvents(matches, seenIds, timeData.items, lecture, mapping);

  return matches;
}

function buildMappingEntry(calendarId, event, lecture) {
  return {
    calendarId,
    eventId: event.id,
    qustnrSn: lecture.qustnrSn,
    title: lecture.title,
    place: lecture.place || "",
    summary: lecture.summary,
    startAt: lecture.startAt,
    endAt: lecture.endAt,
    detailUrl: lecture.detailUrl || "",
    syncedAt: new Date().toISOString()
  };
}

async function upsertManagedLectureEvent(calendarId, lecture, mappings) {
  const existingMapping = mappings[lecture.qustnrSn] || null;
  let resolvedCalendarId = existingMapping?.calendarId || calendarId;
  let event = null;

  if (existingMapping?.eventId) {
    event = await fetchCalendarEventById(resolvedCalendarId, existingMapping.eventId);
    if (!event) {
      console.info("SOMA sync: mapped event missing, will recreate or rebind", {
        qustnrSn: lecture.qustnrSn,
        eventId: existingMapping.eventId,
        summary: lecture.summary
      });
    }
  }

  if (!event) {
    const candidates = await searchLectureCandidateEvents(calendarId, lecture, existingMapping || {});
    console.info("SOMA sync: candidate search result", {
      qustnrSn: lecture.qustnrSn,
      summary: lecture.summary,
      candidateCount: candidates.length
    });
    if (candidates.length > 0) {
      event = candidates[0];
      resolvedCalendarId = calendarId;
    }
  }

  let status = "unchanged";

  if (!event) {
    event = await createManagedCalendarEvent(calendarId, lecture);
    resolvedCalendarId = calendarId;
    status = "created";
    console.info("SOMA sync: created calendar event", {
      qustnrSn: lecture.qustnrSn,
      eventId: event.id,
      summary: lecture.summary
    });
  } else if (!eventMatchesLecture(event, lecture)) {
    event = await updateManagedCalendarEvent(resolvedCalendarId, event.id, lecture);
    status = "updated";
    console.info("SOMA sync: updated calendar event", {
      qustnrSn: lecture.qustnrSn,
      eventId: event.id,
      summary: lecture.summary
    });
  } else {
    console.info("SOMA sync: event already up to date", {
      qustnrSn: lecture.qustnrSn,
      eventId: event.id,
      summary: lecture.summary
    });
  }

  mappings[lecture.qustnrSn] = buildMappingEntry(resolvedCalendarId, event, lecture);
  return {
    status,
    mapping: mappings[lecture.qustnrSn]
  };
}

async function removeManagedLectureEvent(calendarId, lectureLike, mappings) {
  const existingMapping = mappings[lectureLike.qustnrSn] || lectureLike;
  const resolvedCalendarId = existingMapping.calendarId || calendarId;
  let deletedCount = 0;

  if (existingMapping.eventId) {
    const deleted = await deleteCalendarEvent(resolvedCalendarId, existingMapping.eventId, {
      ignoreNotFound: true
    });
    if (deleted) {
      deletedCount += 1;
    }
  }

  if (
    deletedCount === 0 &&
    existingMapping.startAt &&
    existingMapping.endAt &&
    (existingMapping.title || existingMapping.summary)
  ) {
    const lecture = buildLecturePayload(existingMapping, existingMapping);
    const candidates = await searchLectureCandidateEvents(resolvedCalendarId, lecture, existingMapping);

    for (const candidate of candidates) {
      const deleted = await deleteCalendarEvent(resolvedCalendarId, candidate.id, {
        ignoreNotFound: true
      });
      if (deleted) {
        deletedCount += 1;
      }
    }
  }

  delete mappings[lectureLike.qustnrSn];
  return { deletedCount };
}

async function upsertSourceLecture(input) {
  const settings = await getSettings();
  const calendarId = settings.selectedCalendarIds?.[0] || "primary";
  const mappings = await getLectureEventMappings();
  const nextMappings = { ...mappings };
  const lecture = buildLecturePayload(input, nextMappings[input?.qustnrSn] || {});
  const result = await upsertManagedLectureEvent(calendarId, lecture, nextMappings);
  await setLectureEventMappings(nextMappings);
  return {
    status: result.status,
    mapping: result.mapping
  };
}

async function syncSourceLectures(inputs, options = {}) {
  const settings = await getSettings();
  const calendarId = settings.selectedCalendarIds?.[0] || "primary";
  const storedMappings = await getLectureEventMappings();
  const nextMappings = { ...storedMappings };
  const stats = {
    created: 0,
    updated: 0,
    unchanged: 0,
    deleted: 0,
    removed: 0,
    pruned: 0
  };
  const details = [];

  const dedupedLectures = new Map();
  for (const input of inputs || []) {
    if (!input?.qustnrSn) continue;
    dedupedLectures.set(input.qustnrSn, input);
  }

  const activeLectures = Array.from(dedupedLectures.values())
    .map((lecture) => buildLecturePayload(lecture, nextMappings[lecture.qustnrSn] || {}))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  const dedupedInactiveLectures = new Map();
  for (const input of options.inactiveLectures || []) {
    if (!input?.title || !input?.startAt || !input?.endAt) continue;
    if (input.qustnrSn && dedupedLectures.has(input.qustnrSn)) continue;
    const key = input.qustnrSn || `${input.title}@@${input.startAt}@@${input.endAt}`;
    dedupedInactiveLectures.set(key, input);
  }

  for (const lectureInput of dedupedInactiveLectures.values()) {
    const lectureLike = {
      ...lectureInput,
      qustnrSn: lectureInput.qustnrSn || `removed:${lectureInput.title}:${lectureInput.startAt}`
    };
    const result = await removeManagedLectureEvent(calendarId, lectureLike, nextMappings);
    details.push({
      qustnrSn: lectureInput.qustnrSn || "",
      title: lectureInput.title,
      startAt: lectureInput.startAt,
      action: "remove",
      deletedCount: result.deletedCount
    });
    if (result.deletedCount > 0) {
      stats.deleted += result.deletedCount;
      stats.removed += 1;
    }
  }

  const activeLectureIds = new Set();

  for (const lecture of activeLectures) {
    activeLectureIds.add(lecture.qustnrSn);
    const result = await upsertManagedLectureEvent(calendarId, lecture, nextMappings);
    stats[result.status] += 1;
    details.push({
      qustnrSn: lecture.qustnrSn,
      title: lecture.title,
      startAt: lecture.startAt,
      action: result.status,
      eventId: result.mapping?.eventId || "",
      summary: result.mapping?.summary || lecture.summary
    });
  }

  if (options.sourceComplete) {
    for (const qustnrSn of Object.keys(nextMappings)) {
      if (activeLectureIds.has(qustnrSn)) continue;

      const mapping = nextMappings[qustnrSn];
      const result = await removeManagedLectureEvent(calendarId, mapping, nextMappings);
      if (result.deletedCount > 0) {
        stats.deleted += result.deletedCount;
      } else {
        stats.pruned += 1;
      }
    }
  }

  await setLectureEventMappings(nextMappings);

  return {
    stats,
    mappingCount: Object.keys(nextMappings).length,
    details
  };
}

async function deleteCalendarEventByLecture(payload) {
  const settings = await getSettings();
  const calendarId = settings.selectedCalendarIds?.[0] || "primary";
  const mappings = await getLectureEventMappings();
  const nextMappings = { ...mappings };
  const lecture = buildLecturePayload(payload, nextMappings[payload?.qustnrSn] || {});
  const result = await removeManagedLectureEvent(calendarId, lecture, nextMappings);
  await setLectureEventMappings(nextMappings);
  return result;
}

async function connectGoogleCalendar() {
  await getAccessToken(true);
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get("userSettings");
  if (!current.userSettings) {
    await chrome.storage.sync.set({ userSettings: DEFAULT_SETTINGS });
  }
  if (globalThis.SomaPolling?.registerAlarm) {
    try {
      await globalThis.SomaPolling.registerAlarm(chrome);
    } catch (err) {
      console.warn("SOMA polling: failed to register alarm on install", err);
    }
  }
  await rescheduleOffscreenCloseIfPresent();
});

if (chrome.runtime?.onStartup?.addListener) {
  chrome.runtime.onStartup.addListener(async () => {
    await rescheduleOffscreenCloseIfPresent();
  });
}

chrome.action.onClicked.addListener(async () => {
  const calendarUrl = chrome.runtime.getURL("src/calendar/calendar.html");
  const [existingTab] = await chrome.tabs.query({ url: calendarUrl });
  if (existingTab) {
    await chrome.tabs.update(existingTab.id, { active: true });
    if (existingTab.windowId) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url: calendarUrl });
  }
});

if (chrome.alarms?.onAlarm?.addListener) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (!alarm || alarm.name !== globalThis.SomaPolling?.ALARM_KEY) return;
    try {
      await runPollingCycle();
    } catch (err) {
      console.warn("SOMA polling: cycle failed", err);
    }
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target === "offscreen") {
    return false;
  }

  (async () => {
    try {
      if (message.type === "GET_SETTINGS") {
        sendResponse({ ok: true, settings: await getSettings() });
        return;
      }

      if (message.type === "GET_LECTURE_MAPPINGS") {
        const mappings = await getLectureEventMappings();
        sendResponse({
          ok: true,
          mappings: pickLectureMappings(mappings, message.payload?.qustnrSns)
        });
        return;
      }

      if (message.type === "AUTH_CONNECT_GOOGLE") {
        await connectGoogleCalendar();
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "GET_CALENDAR_EVENTS") {
        const { timeMin, timeMax } = message.payload || {};
        if (!timeMin || !timeMax) {
          sendResponse({ ok: false, error: "timeMin/timeMax가 필요합니다." });
          return;
        }
        const events = await fetchCalendarEvents(timeMin, timeMax);
        sendResponse({ ok: true, events });
        return;
      }

      if (message.type === "DELETE_CALENDAR_EVENT") {
        const settings = await getSettings();
        if (!settings.allowDirectDelete) {
          sendResponse({ ok: false, error: "직접 삭제 기능이 비활성화되어 있습니다." });
          return;
        }
        await deleteCalendarEvent(message.payload.calendarId, message.payload.eventId);
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "UPSERT_SOURCE_LECTURE") {
        const result = await upsertSourceLecture(message.payload);
        sendResponse({ ok: true, ...result });
        return;
      }

      if (message.type === "SYNC_SOURCE_LECTURES") {
        const result = await syncSourceLectures(message.payload?.lectures, {
          inactiveLectures: message.payload?.inactiveLectures,
          sourceComplete: Boolean(message.payload?.sourceComplete)
        });
        sendResponse({ ok: true, ...result });
        return;
      }

      if (message.type === "DELETE_CALENDAR_EVENT_BY_LECTURE") {
        const result = await deleteCalendarEventByLecture(message.payload);
        sendResponse({ ok: true, ...result });
        return;
      }

      if (message.type === "POLLING_TRIGGER_NOW") {
        const result = await runPollingCycle();
        sendResponse(result);
        return;
      }

      if (message.type === "POLLING_GET_STATE") {
        const settings = await globalThis.SomaPolling.readSettings(chrome);
        const state = await globalThis.SomaPolling.readState(chrome);
        const snapshotResult = await chrome.storage.local.get("lectureSnapshot");
        sendResponse({
          ok: true,
          settings,
          state,
          snapshot: snapshotResult.lectureSnapshot || null
        });
        return;
      }

      if (message.type === "POLLING_UPDATE_SETTINGS") {
        const next = await globalThis.SomaPolling.updateSettings(chrome, message.payload || {});
        sendResponse({ ok: true, settings: next });
        return;
      }

      if (message.type === "OFFSCREEN_PARSE_HTML") {
        return;
      }

      sendResponse({ ok: false, error: "알 수 없는 메시지 타입입니다." });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();

  return true;
});
