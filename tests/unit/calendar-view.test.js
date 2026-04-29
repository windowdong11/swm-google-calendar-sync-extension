const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const CalendarView = require(
  path.resolve(__dirname, "../../src/calendar/calendar-view.js")
);

const {
  getWeekDates,
  splitEventByDay,
  calcEventPosition,
  isSomaManaged,
  isOutOfWeekRange,
  calcFetchRange,
  calcPeriodLabel,
  resolveSidePanelEmptyMsg,
  renderWeekGrid,
  renderMonthGrid,
  renderSidePanel
} = CalendarView;

function makeEvent(summary, startISO, endISO, extra = {}) {
  return {
    id: summary,
    summary,
    start: { dateTime: startISO },
    end: { dateTime: endISO },
    htmlLink: "https://calendar.google.com",
    ...extra
  };
}

function makeFlatEvent(title, startAt, endAt, extra = {}) {
  return { title, startAt, endAt, ...extra };
}

function makeGridEl() {
  const dom = new JSDOM("<!DOCTYPE html><div id='cal-grid'></div>");
  return dom.window.document.getElementById("cal-grid");
}

function makeBodyEl() {
  const dom = new JSDOM("<!DOCTYPE html><div id='body'></div>");
  return dom.window.document.getElementById("body");
}

// ── getWeekDates ──────────────────────────────────────────────────────────

test("getWeekDates: 주의 7일을 일요일 시작으로 반환", () => {
  // 2026-05-13은 수요일
  const dates = getWeekDates("2026-05-13");
  assert.equal(dates.length, 7);
  assert.equal(dates[0], "2026-05-10"); // 일요일
  assert.equal(dates[6], "2026-05-16"); // 토요일
});

// ── splitEventByDay ──────────────────────────────────────────────────────

test("splitEventByDay: 자정을 넘는 이벤트를 날짜별로 분할", () => {
  // KST 2026-05-10 22:00 ~ 2026-05-11 02:00 (UTC 13:00~17:00)
  const event = makeEvent("야간 강의", "2026-05-10T13:00:00Z", "2026-05-10T17:00:00Z");
  const segs = splitEventByDay(event);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].dateStr, "2026-05-10");
  assert.equal(segs[1].dateStr, "2026-05-11");
});

test("splitEventByDay: 같은 날 이벤트는 분할 없음", () => {
  const event = makeEvent("낮 강의", "2026-05-10T02:00:00Z", "2026-05-10T04:00:00Z");
  const segs = splitEventByDay(event);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].dateStr, "2026-05-10");
});

// ── calcEventPosition ─────────────────────────────────────────────────────

test("calcEventPosition: 08:00~09:00 이벤트는 top=0 height=60", () => {
  const dayStart = new Date("2026-05-10T00:00:00+09:00").getTime();
  const startMs = new Date("2026-05-10T08:00:00+09:00").getTime();
  const endMs = new Date("2026-05-10T09:00:00+09:00").getTime();
  const { top, height } = calcEventPosition(startMs, endMs, dayStart);
  assert.equal(top, 0);
  assert.equal(height, 60);
});

test("calcEventPosition: 10:00~11:00 이벤트는 top=120 height=60", () => {
  const dayStart = new Date("2026-05-10T00:00:00+09:00").getTime();
  const startMs = new Date("2026-05-10T10:00:00+09:00").getTime();
  const endMs = new Date("2026-05-10T11:00:00+09:00").getTime();
  const { top, height } = calcEventPosition(startMs, endMs, dayStart);
  assert.equal(top, 120);
  assert.equal(height, 60);
});

// ── isSomaManaged ─────────────────────────────────────────────────────────

test("isSomaManaged: somaManaged=1 이벤트를 식별", () => {
  const ev = makeEvent("소마 특강", "2026-05-10T10:00:00+09:00", "2026-05-10T12:00:00+09:00", {
    extendedProperties: { private: { somaManaged: "1", somaQustnrSn: "999" } }
  });
  assert.equal(isSomaManaged(ev), true);
});

test("isSomaManaged: extendedProperties 없는 일반 이벤트는 false", () => {
  const ev = makeEvent("일반 일정", "2026-05-10T10:00:00+09:00", "2026-05-10T11:00:00+09:00");
  assert.equal(isSomaManaged(ev), false);
});

// ── isOutOfWeekRange ──────────────────────────────────────────────────────

test("isOutOfWeekRange: UTC 21:00 = KST 06:00 이벤트는 시간축(08:00~24:00) 밖", () => {
  const ev = makeEvent("새벽 이벤트", "2026-05-10T21:00:00Z", "2026-05-10T22:00:00Z");
  assert.equal(isOutOfWeekRange(ev, "2026-05-10"), true);
});

test("isOutOfWeekRange: UTC 01:00 = KST 10:00 이벤트는 시간축 내", () => {
  const ev = makeEvent("낮 이벤트", "2026-05-10T01:00:00Z", "2026-05-10T02:00:00Z");
  assert.equal(isOutOfWeekRange(ev, "2026-05-10"), false);
});

// ── calcFetchRange ─────────────────────────────────────────────────────────

test("calcFetchRange week: 해당 주의 일요일~토요일을 포함", () => {
  // 2026-05-13 (수요일) → 주는 05-10(일)~05-16(토)
  const anchor = new Date("2026-05-13T00:00:00+09:00");
  const { timeMin, timeMax } = calcFetchRange("week", anchor);
  // KST 05-10 00:00 = UTC 05-09T15:00
  assert.ok(timeMin.startsWith("2026-05-09"), `timeMin covers 05-10 KST: ${timeMin}`);
  // KST 05-16 23:59 = UTC 05-16T14:59
  assert.ok(timeMax.includes("2026-05-16"), `timeMax covers 05-16 KST: ${timeMax}`);
});

test("calcFetchRange month: 해당 달 전체를 포함", () => {
  const anchor = new Date("2026-05-13T00:00:00+09:00");
  const { timeMin, timeMax } = calcFetchRange("month", anchor);
  assert.ok(
    timeMin.startsWith("2026-04-30") || timeMin.startsWith("2026-05-01"),
    `timeMin should be start of May KST: ${timeMin}`
  );
  assert.ok(
    timeMax.includes("2026-05-31") || timeMax.includes("2026-05-30"),
    `timeMax should cover end of May: ${timeMax}`
  );
});

// ── resolveSidePanelEmptyMsg ───────────────────────────────────────────────

test("resolveSidePanelEmptyMsg: snapshot 없으면 폴링 안내", () => {
  const msg = resolveSidePanelEmptyMsg(null, null);
  assert.ok(msg && msg.includes("폴링"));
});

test("resolveSidePanelEmptyMsg: auth-expired 상태 안내", () => {
  const snapshot = { takenAt: "2026-05-10T10:00:00+09:00", lectures: [] };
  const state = { pausedReason: "auth-expired" };
  const msg = resolveSidePanelEmptyMsg(snapshot, state);
  assert.ok(msg && msg.includes("로그인"));
});

test("resolveSidePanelEmptyMsg: 정상 snapshot이면 null 반환", () => {
  const snapshot = { takenAt: "2026-05-10T10:00:00+09:00", lectures: [] };
  const msg = resolveSidePanelEmptyMsg(snapshot, null);
  assert.equal(msg, null);
});

// ── renderWeekGrid ─────────────────────────────────────────────────────────

test("renderWeekGrid: SoMA managed 이벤트에 soma-managed 클래스 부여", () => {
  const gridEl = makeGridEl();
  const events = [
    makeEvent("일반 일정", "2026-05-10T01:00:00Z", "2026-05-10T02:00:00Z"),
    makeEvent("소마 특강", "2026-05-12T01:00:00Z", "2026-05-12T03:00:00Z", {
      extendedProperties: { private: { somaManaged: "1" } }
    })
  ];
  const anchor = new Date("2026-05-13T00:00:00+09:00");
  renderWeekGrid(gridEl, anchor, events);

  const somaBlocks = gridEl.querySelectorAll(".cal-event.soma-managed");
  assert.equal(somaBlocks.length, 1, "SoMA 이벤트에 soma-managed 클래스가 부여되어야 한다");
  const allBlocks = gridEl.querySelectorAll(".cal-event");
  assert.equal(allBlocks.length, 2, "이벤트 블록 2개가 렌더되어야 한다");
});

test("renderWeekGrid: 자정 넘는 이벤트를 두 날 셀에 분할 렌더", () => {
  const gridEl = makeGridEl();
  // KST 2026-05-10 22:00 ~ 2026-05-11 02:00 (UTC 13:00~17:00)
  const events = [makeEvent("야간 강의", "2026-05-10T13:00:00Z", "2026-05-10T17:00:00Z")];
  const anchor = new Date("2026-05-13T00:00:00+09:00");
  renderWeekGrid(gridEl, anchor, events);

  const allBlocks = gridEl.querySelectorAll(".cal-event");
  // 05-10 22:00~24:00 블록은 시간축 내, 05-11 00:00~02:00 블록은 시간축 밖(08:00 미만)
  // 최소 05-10 분에 1개 블록
  assert.ok(allBlocks.length >= 1, "자정 넘는 이벤트도 시간축 내 부분은 렌더되어야 한다");
});

test("renderWeekGrid: 시간축 밖 이벤트는 outOfRangeCount 반영", () => {
  const gridEl = makeGridEl();
  // UTC 21:00 = KST 06:00 (시간축 밖)
  const events = [makeEvent("새벽 이벤트", "2026-05-10T21:00:00Z", "2026-05-10T22:00:00Z")];
  const anchor = new Date("2026-05-13T00:00:00+09:00");

  const { outOfRangeCount } = renderWeekGrid(gridEl, anchor, events);
  assert.ok(outOfRangeCount >= 1, "시간축 밖 이벤트는 outOfRangeCount에 포함되어야 한다");
  const gridBlocks = gridEl.querySelectorAll(".cal-event");
  assert.equal(gridBlocks.length, 0, "시간축 밖 이벤트는 그리드에 블록을 남기지 않는다");
});

// ── 평면 형식 fallback ─────────────────────────────────────────────────────

test("splitEventByDay: 평면 형식(startAt/endAt)으로 자정 넘는 이벤트 분할", () => {
  // KST 2026-05-10 22:00 ~ 2026-05-11 02:00
  const ev = makeFlatEvent("야간 강의", "2026-05-10T22:00:00+09:00", "2026-05-11T02:00:00+09:00");
  const segs = splitEventByDay(ev);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].dateStr, "2026-05-10");
  assert.equal(segs[1].dateStr, "2026-05-11");
});

test("splitEventByDay: 평면 형식 같은 날 이벤트는 분할 없음", () => {
  const ev = makeFlatEvent("낮 강의", "2026-05-10T10:00:00+09:00", "2026-05-10T12:00:00+09:00");
  const segs = splitEventByDay(ev);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].dateStr, "2026-05-10");
});

test("isSomaManaged: isSomaLecture=true 평면 이벤트는 true", () => {
  const ev = makeFlatEvent("소마 특강", "2026-05-10T10:00:00+09:00", "2026-05-10T12:00:00+09:00", { isSomaLecture: true });
  assert.equal(isSomaManaged(ev), true);
});

test("isSomaManaged: isSomaLecture=false 평면 이벤트는 false", () => {
  const ev = makeFlatEvent("일반 일정", "2026-05-10T10:00:00+09:00", "2026-05-10T11:00:00+09:00", { isSomaLecture: false });
  assert.equal(isSomaManaged(ev), false);
});

test("isSomaManaged: isSomaLecture 없는 평면 이벤트는 false", () => {
  const ev = makeFlatEvent("일반 일정", "2026-05-10T10:00:00+09:00", "2026-05-10T11:00:00+09:00");
  assert.equal(isSomaManaged(ev), false);
});

test("isOutOfWeekRange: 평면 형식 KST 06:00 이벤트는 시간축(08:00~24:00) 밖", () => {
  const ev = makeFlatEvent("새벽 이벤트", "2026-05-10T06:00:00+09:00", "2026-05-10T07:00:00+09:00");
  assert.equal(isOutOfWeekRange(ev, "2026-05-10"), true);
});

test("isOutOfWeekRange: 평면 형식 KST 10:00 이벤트는 시간축 내", () => {
  const ev = makeFlatEvent("낮 이벤트", "2026-05-10T10:00:00+09:00", "2026-05-10T11:00:00+09:00");
  assert.equal(isOutOfWeekRange(ev, "2026-05-10"), false);
});

test("renderWeekGrid: 평면 형식 isSomaLecture 이벤트에 soma-managed 클래스 부여", () => {
  const gridEl = makeGridEl();
  const events = [
    makeFlatEvent("일반 일정", "2026-05-10T10:00:00+09:00", "2026-05-10T11:00:00+09:00"),
    makeFlatEvent("소마 특강", "2026-05-12T10:00:00+09:00", "2026-05-12T12:00:00+09:00", { isSomaLecture: true })
  ];
  const anchor = new Date("2026-05-13T00:00:00+09:00");
  renderWeekGrid(gridEl, anchor, events);

  const somaBlocks = gridEl.querySelectorAll(".cal-event.soma-managed");
  assert.equal(somaBlocks.length, 1, "isSomaLecture 이벤트에 soma-managed 클래스가 부여되어야 한다");
  const allBlocks = gridEl.querySelectorAll(".cal-event");
  assert.equal(allBlocks.length, 2, "이벤트 블록 2개가 렌더되어야 한다");
});

test("renderWeekGrid: 평면 형식 이벤트 title이 블록에 렌더됨", () => {
  const gridEl = makeGridEl();
  const events = [makeFlatEvent("평면 특강", "2026-05-12T10:00:00+09:00", "2026-05-12T12:00:00+09:00")];
  const anchor = new Date("2026-05-13T00:00:00+09:00");
  renderWeekGrid(gridEl, anchor, events);

  const titleEl = gridEl.querySelector(".cal-event-title");
  assert.ok(titleEl, "제목 요소가 존재해야 한다");
  assert.equal(titleEl.textContent, "평면 특강");
});

// ── renderSidePanel ────────────────────────────────────────────────────────

test("renderSidePanel: 빈 결과 + 폴링 안내 메시지 렌더", () => {
  const bodyEl = makeBodyEl();
  renderSidePanel(bodyEl, [], "백그라운드 폴링이 아직 실행되지 않았습니다.");
  const msg = bodyEl.querySelector(".side-empty-msg");
  assert.ok(msg, "빈 상태 메시지 요소가 존재해야 한다");
  assert.ok(msg.textContent.includes("폴링"), "폴링 안내 메시지여야 한다");
});

test("renderSidePanel: auth-expired 상태 안내 렌더", () => {
  const bodyEl = makeBodyEl();
  renderSidePanel(bodyEl, [], "SoMA 로그인이 만료되었습니다.");
  const msg = bodyEl.querySelector(".side-empty-msg");
  assert.ok(msg && msg.textContent.includes("로그인"), "auth-expired 안내 메시지여야 한다");
});

test("renderSidePanel: 특강 카드가 렌더되고 tabIndex=0이 설정됨", () => {
  const bodyEl = makeBodyEl();
  const lectures = [
    {
      id: "1",
      title: "테스트 특강",
      startAt: "2026-05-15T10:00:00+09:00",
      endAt: "2026-05-15T12:00:00+09:00",
      url: "https://swmaestro.ai/lec/1"
    }
  ];
  renderSidePanel(bodyEl, lectures, null);
  const card = bodyEl.querySelector(".lecture-card");
  assert.ok(card, "카드 요소가 존재해야 한다");
  assert.equal(card.tabIndex, 0, "카드는 키보드 포커스 가능해야 한다");
  assert.ok(card.querySelector(".lecture-card-title")?.textContent.includes("테스트 특강"));
});
