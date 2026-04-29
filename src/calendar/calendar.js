import {
  renderWeekGrid,
  renderMonthGrid,
  renderSidePanel,
  resolveSidePanelEmptyMsg,
  calcFetchRange,
  calcPeriodLabel,
  getWeekDates
} from "./calendar-view.js";
import { filterLecturesForPanel } from "./lecture-filter.js";

// ── State ──────────────────────────────────────────────────────────────────
let viewMode = "week";      // "week" | "month"
let anchorDate = new Date();
let events = [];
let snapshot = null;
let pollingState = null;
let dragRange = null;       // { start: string, end: string } | null

// ── DOM refs ───────────────────────────────────────────────────────────────
const gridEl = document.getElementById("cal-grid");
const gridContainer = document.getElementById("cal-grid-container");
const authErrorEl = document.getElementById("cal-auth-error");
const sidePanelBody = document.getElementById("side-panel-body");
const lblPeriod = document.getElementById("lbl-period");
const lblLastUpdated = document.getElementById("lbl-last-updated");
const lblDragRange = document.getElementById("lbl-drag-range");
const btnClearDrag = document.getElementById("btn-clear-drag");
const btnViewMonth = document.getElementById("btn-view-month");
const btnViewWeek = document.getElementById("btn-view-week");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const btnRefresh = document.getElementById("btn-refresh");
const linkOptions = document.getElementById("link-options");
const footerEl = document.getElementById("cal-week-footer");
const lblOutOfRange = document.getElementById("lbl-out-of-range");

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  linkOptions.href = chrome.runtime.getURL("src/options/options.html");

  const stored = await chrome.storage.local.get(["calendarViewMode", "calendarAnchorDate"]);
  if (stored.calendarViewMode) viewMode = stored.calendarViewMode;
  if (stored.calendarAnchorDate) anchorDate = new Date(stored.calendarAnchorDate);

  updateViewToggleUI();
  lblPeriod.textContent = calcPeriodLabel(viewMode, anchorDate);

  await loadAll();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.lectureSnapshot) {
      snapshot = changes.lectureSnapshot.newValue || null;
      updateSidePanel();
    }
    if (changes.pollingState) {
      pollingState = changes.pollingState.newValue || null;
      updateSidePanel();
    }
  });
}

async function loadAll() {
  await Promise.all([fetchCalendarEvents(), loadSnapshot()]);
  renderGrid();
  updateSidePanel();
}

// ── Data loading ──────────────────────────────────────────────────────────
async function fetchCalendarEvents() {
  const { timeMin, timeMax } = calcFetchRange(viewMode, anchorDate);
  authErrorEl.hidden = true;
  gridEl.style.opacity = "0.6";
  try {
    const resp = await chrome.runtime.sendMessage({
      type: "GET_CALENDAR_EVENTS",
      payload: { timeMin, timeMax }
    });
    if (resp?.ok) {
      events = resp.events || [];
    } else {
      events = [];
      authErrorEl.hidden = false;
    }
  } catch {
    events = [];
    authErrorEl.hidden = false;
  } finally {
    gridEl.style.opacity = "";
  }
}

async function loadSnapshot() {
  try {
    const stored = await chrome.storage.local.get(["lectureSnapshot", "pollingState"]);
    snapshot = stored.lectureSnapshot || null;
    pollingState = stored.pollingState || null;

    if (snapshot?.takenAt) {
      const t = new Date(snapshot.takenAt);
      lblLastUpdated.textContent = `마지막 갱신: ${t.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
    }
  } catch {
    snapshot = null;
  }
}

// ── Render ────────────────────────────────────────────────────────────────
function renderGrid() {
  lblPeriod.textContent = calcPeriodLabel(viewMode, anchorDate);
  clearDragOverlay();

  if (viewMode === "week") {
    const { outOfRangeCount } = renderWeekGrid(gridEl, anchorDate, events);
    footerEl.hidden = outOfRangeCount === 0;
    if (outOfRangeCount > 0) {
      lblOutOfRange.textContent = `시간 범위 밖 ${outOfRangeCount}건`;
    }
  } else {
    renderMonthGrid(gridEl, anchorDate, events);
    footerEl.hidden = true;
  }
}

function updateSidePanel() {
  const lectures = snapshot?.lectures || [];
  const now = new Date();

  const filtered = filterLecturesForPanel(lectures, dragRange, now);

  let emptyMsg = null;
  if (lectures.length === 0) {
    emptyMsg = resolveSidePanelEmptyMsg(snapshot, pollingState);
  } else if (filtered.length === 0 && dragRange) {
    emptyMsg = "이 시간대에 들어맞는 미신청 특강이 없습니다.";
  }

  renderSidePanel(sidePanelBody, filtered, emptyMsg);
}

// ── View controls ─────────────────────────────────────────────────────────
function updateViewToggleUI() {
  btnViewMonth.classList.toggle("active", viewMode === "month");
  btnViewWeek.classList.toggle("active", viewMode === "week");
}

async function setViewMode(mode) {
  viewMode = mode;
  await chrome.storage.local.set({ calendarViewMode: mode });
  updateViewToggleUI();
  await fetchCalendarEvents();
  renderGrid();
  updateSidePanel();
}

async function navigate(direction) {
  const d = new Date(anchorDate);
  if (viewMode === "week") {
    d.setDate(d.getDate() + direction * 7);
  } else {
    d.setMonth(d.getMonth() + direction);
  }
  anchorDate = d;
  await chrome.storage.local.set({ calendarAnchorDate: anchorDate.toISOString() });
  await fetchCalendarEvents();
  renderGrid();
}

async function refresh() {
  btnRefresh.disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: "POLLING_TRIGGER_NOW" });
    await loadAll();
    renderGrid();
    updateSidePanel();
  } finally {
    btnRefresh.disabled = false;
  }
}

// ── Drag interaction ──────────────────────────────────────────────────────
let dragState = null; // { colEl, startY, startH }

function getDragTimeFromY(colEl, y) {
  const rect = colEl.getBoundingClientRect();
  const relY = y - rect.top;
  const totalHeight = rect.height;
  const totalHours = 16; // WEEK_END_HOUR - WEEK_START_HOUR
  const rawHour = (relY / totalHeight) * totalHours + 8; // WEEK_START_HOUR
  // clamp to [8, 24]
  const clampedHour = Math.min(24, Math.max(8, rawHour));
  const minutes = Math.round((clampedHour % 1) * 60);
  const hour = Math.floor(clampedHour);
  return { hour, minutes };
}

function hourMinToIso(dateStr, hour, minutes) {
  const h = Math.min(23, hour); // avoid 24:00 in ISO
  const m = minutes || 0;
  if (hour === 24) {
    // next day 00:00
    const d = new Date(`${dateStr}T00:00:00+09:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  return new Date(
    `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+09:00`
  ).toISOString();
}

let dragOverlayEl = null;

function clearDragOverlay() {
  if (dragOverlayEl) {
    dragOverlayEl.remove();
    dragOverlayEl = null;
  }
}

function onGridMouseDown(e) {
  if (viewMode !== "week") return;
  const colEl = e.target.closest("[data-date]");
  if (!colEl) return;
  // 이벤트 블록 위는 드래그 시작 안 함
  if (e.target.closest(".cal-event")) return;

  const dateStr = colEl.dataset.date;
  const startPos = getDragTimeFromY(colEl, e.clientY);

  dragState = { colEl, dateStr, startHour: startPos.hour, startMin: startPos.minutes, endHour: startPos.hour, endMin: startPos.minutes };

  clearDragOverlay();
  dragOverlayEl = document.createElement("div");
  dragOverlayEl.className = "cal-drag-overlay";
  colEl.appendChild(dragOverlayEl);

  updateDragOverlay();

  const onMove = (ev) => {
    const pos = getDragTimeFromY(colEl, ev.clientY);
    dragState.endHour = pos.hour;
    dragState.endMin = pos.minutes;
    updateDragOverlay();
  };

  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);

    if (!dragState) return;

    const { dateStr, startHour, startMin, endHour, endMin } = dragState;
    const startIso = hourMinToIso(dateStr, Math.min(startHour, endHour), startHour <= endHour ? startMin : endMin);
    const endIso = hourMinToIso(dateStr, Math.max(startHour, endHour), startHour <= endHour ? endMin : startMin);

    if (startIso !== endIso) {
      dragRange = { start: startIso, end: endIso };
      updateDragRangeUI();
      updateSidePanel();
    }

    dragState = null;
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function updateDragOverlay() {
  if (!dragOverlayEl || !dragState) return;
  const colEl = dragState.colEl;
  const rect = colEl.getBoundingClientRect();
  const totalHeight = rect.height;
  const totalHours = 16;
  const pixPerHour = totalHeight / totalHours;

  const startH = (Math.min(dragState.startHour, dragState.endHour) - 8) * pixPerHour +
    Math.min(dragState.startMin, dragState.endMin) / 60 * pixPerHour;
  const endH = (Math.max(dragState.startHour, dragState.endHour) - 8) * pixPerHour +
    Math.max(dragState.startMin, dragState.endMin) / 60 * pixPerHour;

  dragOverlayEl.style.top = startH + "px";
  dragOverlayEl.style.height = Math.max(1, endH - startH) + "px";
}

function updateDragRangeUI() {
  if (!dragRange) {
    lblDragRange.textContent = "전체 미신청 특강";
    btnClearDrag.hidden = true;
  } else {
    const s = new Date(dragRange.start);
    const e = new Date(dragRange.end);
    const fmt = (d) => d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
    lblDragRange.textContent = `${fmt(s)} ~ ${fmt(e)}`;
    btnClearDrag.hidden = false;
  }
}

function clearDragSelection() {
  dragRange = null;
  clearDragOverlay();
  updateDragRangeUI();
  updateSidePanel();
}

// ESC로 드래그 해제
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") clearDragSelection();
});

// ── Event bindings ────────────────────────────────────────────────────────
btnViewMonth.addEventListener("click", () => setViewMode("month"));
btnViewWeek.addEventListener("click", () => setViewMode("week"));
btnPrev.addEventListener("click", () => navigate(-1));
btnNext.addEventListener("click", () => navigate(1));
btnRefresh.addEventListener("click", refresh);
btnClearDrag.addEventListener("click", clearDragSelection);
gridContainer.addEventListener("mousedown", onGridMouseDown);

// ── Start ─────────────────────────────────────────────────────────────────
init();
