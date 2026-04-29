/**
 * calendar-view.js — 그리드 및 사이드 패널 렌더 함수 모음.
 * DOM을 직접 조작하나 chrome API에는 의존하지 않는다.
 * CJS exports + browser global 이중 지원.
 */

const WEEK_START_HOUR = 8;   // 08:00
const WEEK_END_HOUR = 24;    // 24:00 (자정)
const HOURS_IN_VIEW = WEEK_END_HOUR - WEEK_START_HOUR; // 16
const PIXELS_PER_HOUR = 60;

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * Date를 Asia/Seoul 기준 YYYY-MM-DD 로 변환.
 */
function toKSTDateStr(date) {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

/**
 * Date를 Asia/Seoul 기준 HH:mm 로 변환.
 */
function toKSTTimeStr(date) {
  return date.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

/**
 * Seoul TZ에서 해당 날짜의 00:00:00 epoch (ms).
 */
function kstDayStartMs(dateStr) {
  return new Date(`${dateStr}T00:00:00+09:00`).getTime();
}

/**
 * 주간 뷰에서 이벤트 블록의 top/height(px)를 계산.
 * WEEK_START_HOUR~WEEK_END_HOUR 범위 내로 clamp.
 * @param {number} startMs
 * @param {number} endMs
 * @param {number} dayStartMs - 해당 날의 KST 자정 epoch
 * @returns {{ top: number, height: number, clipped: boolean }}
 */
function calcEventPosition(startMs, endMs, dayStartMs) {
  const viewStartMs = dayStartMs + WEEK_START_HOUR * 3600 * 1000;
  const viewEndMs = dayStartMs + WEEK_END_HOUR * 3600 * 1000;

  const clampedStart = Math.max(startMs, viewStartMs);
  const clampedEnd = Math.min(endMs, viewEndMs);

  const clipped = startMs < viewStartMs || endMs > viewEndMs;
  const top = ((clampedStart - viewStartMs) / (3600 * 1000)) * PIXELS_PER_HOUR;
  const height = Math.max(((clampedEnd - clampedStart) / (3600 * 1000)) * PIXELS_PER_HOUR, 14);

  return { top, height, clipped };
}

/**
 * 자정을 넘는 이벤트를 날짜별로 분할하여 [{dateStr, startMs, endMs}] 배열 반환.
 */
function splitEventByDay(event) {
  const startMs = new Date(event.start.dateTime || event.start.date + "T00:00:00+09:00").getTime();
  const endMs = new Date(event.end.dateTime || event.end.date + "T00:00:00+09:00").getTime();

  const segments = [];
  let curMs = startMs;

  while (curMs < endMs) {
    const dateStr = toKSTDateStr(new Date(curMs));
    const nextDayMs = kstDayStartMs(dateStr) + 24 * 3600 * 1000;
    const segEnd = Math.min(endMs, nextDayMs);
    segments.push({ dateStr, startMs: curMs, endMs: segEnd });
    curMs = segEnd;
  }

  return segments;
}

/**
 * 이벤트가 해당 날 시간축(WEEK_START_HOUR~WEEK_END_HOUR) 밖에만 있는지 판단.
 */
function isOutOfWeekRange(event, dateStr) {
  const dayStartMs = kstDayStartMs(dateStr);
  const viewStartMs = dayStartMs + WEEK_START_HOUR * 3600 * 1000;
  const viewEndMs = dayStartMs + WEEK_END_HOUR * 3600 * 1000;

  const startMs = new Date(event.start.dateTime || event.start.date + "T00:00:00+09:00").getTime();
  const endMs = new Date(event.end.dateTime || event.end.date + "T00:00:00+09:00").getTime();

  return endMs <= viewStartMs || startMs >= viewEndMs;
}

/**
 * 이벤트에 somaManaged 클래스가 필요한지.
 */
function isSomaManaged(event) {
  return event?.extendedProperties?.private?.somaManaged === "1";
}

/**
 * 주간 그리드 기준으로 해당 주의 7일 날짜 문자열 배열 반환 (일~토).
 */
function getWeekDates(anchorDateStr) {
  const d = new Date(`${anchorDateStr}T12:00:00+09:00`);
  const dow = d.getDay();
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(d);
    day.setDate(d.getDate() - dow + i);
    dates.push(toKSTDateStr(day));
  }
  return dates;
}

/**
 * viewMode="week" 그리드를 #cal-grid에 렌더한다.
 * @param {Element} gridEl
 * @param {Date} anchorDate  - 그 주의 임의 날짜 (KST 기준)
 * @param {Array} events     - CalendarEvent[]
 * @returns {{ outOfRangeCount: number, weekDates: string[] }}
 */
function renderWeekGrid(gridEl, anchorDate, events) {
  gridEl.innerHTML = "";
  gridEl.className = "cal-grid week-mode";

  const anchorStr = toKSTDateStr(anchorDate);
  const weekDates = getWeekDates(anchorStr);
  const todayStr = toKSTDateStr(new Date());

  const frag = gridEl.ownerDocument.createDocumentFragment();

  // 빈 시간축 헤더 셀
  const timeHeaderCell = gridEl.ownerDocument.createElement("div");
  timeHeaderCell.className = "cal-col-header";
  timeHeaderCell.style.gridColumn = "1";
  timeHeaderCell.style.gridRow = "1";
  frag.appendChild(timeHeaderCell);

  // 요일 헤더
  weekDates.forEach((dateStr, i) => {
    const d = new Date(`${dateStr}T12:00:00+09:00`);
    const cell = gridEl.ownerDocument.createElement("div");
    cell.className = "cal-col-header" + (dateStr === todayStr ? " today-header" : "");
    cell.style.gridColumn = String(i + 2);
    cell.style.gridRow = "1";
    cell.textContent = `${DAY_NAMES[d.getDay()]} ${d.getDate()}`;
    cell.setAttribute("aria-label", dateStr);
    frag.appendChild(cell);
  });

  // 시간 축 컨테이너
  const timeAxisWrapper = gridEl.ownerDocument.createElement("div");
  timeAxisWrapper.style.gridColumn = "1";
  timeAxisWrapper.style.gridRow = "2";
  timeAxisWrapper.style.position = "relative";
  timeAxisWrapper.style.height = HOURS_IN_VIEW * PIXELS_PER_HOUR + "px";
  for (let h = WEEK_START_HOUR; h <= WEEK_END_HOUR; h++) {
    const label = gridEl.ownerDocument.createElement("div");
    label.className = "cal-hour-label";
    label.style.top = (h - WEEK_START_HOUR) * PIXELS_PER_HOUR + "px";
    label.textContent = `${String(h).padStart(2, "0")}:00`;
    timeAxisWrapper.appendChild(label);
  }
  frag.appendChild(timeAxisWrapper);

  // 이벤트를 날짜별 버킷으로 분배
  const buckets = {};
  weekDates.forEach((d) => { buckets[d] = []; });

  for (const event of events) {
    const segments = splitEventByDay(event);
    for (const seg of segments) {
      if (buckets[seg.dateStr]) {
        buckets[seg.dateStr].push({ event, seg });
      }
    }
  }

  let outOfRangeCount = 0;

  // 날짜 컬럼 렌더
  weekDates.forEach((dateStr, i) => {
    const col = gridEl.ownerDocument.createElement("div");
    col.className = "cal-week-col" + (dateStr === todayStr ? " today-col" : "");
    col.style.gridColumn = String(i + 2);
    col.style.gridRow = "2";
    col.setAttribute("aria-label", dateStr);
    col.dataset.date = dateStr;

    // 시간 줄 그리기
    for (let h = 0; h < HOURS_IN_VIEW; h++) {
      const line = gridEl.ownerDocument.createElement("div");
      line.className = "cal-hour-line";
      line.style.top = h * PIXELS_PER_HOUR + "px";
      col.appendChild(line);
    }

    col.style.height = HOURS_IN_VIEW * PIXELS_PER_HOUR + "px";

    const dayStartMs = kstDayStartMs(dateStr);

    for (const { event, seg } of buckets[dateStr]) {
      if (isOutOfWeekRange(event, dateStr)) {
        outOfRangeCount++;
        continue;
      }
      const { top, height } = calcEventPosition(seg.startMs, seg.endMs, dayStartMs);
      const block = gridEl.ownerDocument.createElement("div");
      block.className = "cal-event" + (isSomaManaged(event) ? " soma-managed" : "");
      block.style.top = top + "px";
      block.style.height = height + "px";
      const title = gridEl.ownerDocument.createElement("div");
      title.className = "cal-event-title";
      title.textContent = event.summary || "(제목 없음)";
      block.appendChild(title);
      if (event.htmlLink) {
        block.title = event.summary || "";
        block.addEventListener("click", () => {
          if (typeof window !== "undefined") window.open(event.htmlLink, "_blank");
        });
      }
      col.appendChild(block);
    }

    frag.appendChild(col);
  });

  gridEl.appendChild(frag);
  return { outOfRangeCount, weekDates };
}

/**
 * viewMode="month" 그리드를 #cal-grid에 렌더한다.
 */
function renderMonthGrid(gridEl, anchorDate, events) {
  gridEl.innerHTML = "";
  gridEl.className = "cal-grid month-mode";

  const anchorStr = toKSTDateStr(anchorDate);
  const [year, month] = anchorStr.split("-").map(Number);
  const todayStr = toKSTDateStr(new Date());

  const frag = gridEl.ownerDocument.createDocumentFragment();

  DAY_NAMES.forEach((d) => {
    const h = gridEl.ownerDocument.createElement("div");
    h.className = "cal-col-header";
    h.textContent = d;
    frag.appendChild(h);
  });

  const firstDay = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+09:00`);

  const eventByDate = {};
  for (const event of events) {
    const segments = splitEventByDay(event);
    for (const seg of segments) {
      if (!eventByDate[seg.dateStr]) eventByDate[seg.dateStr] = [];
      eventByDate[seg.dateStr].push(event);
    }
  }

  const startDow = firstDay.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const offset = i - startDow;
    const cellDate = new Date(firstDay);
    cellDate.setDate(offset + 1);
    const isOtherMonth = offset < 0 || offset >= daysInMonth;

    const dateStr = toKSTDateStr(cellDate);
    const cell = gridEl.ownerDocument.createElement("div");
    cell.className = "cal-month-cell" +
      (isOtherMonth ? " other-month" : "") +
      (dateStr === todayStr ? " today" : "");
    cell.setAttribute("aria-label", dateStr);
    cell.dataset.date = dateStr;

    const dateLabel = gridEl.ownerDocument.createElement("div");
    dateLabel.className = "cal-month-cell-date";
    dateLabel.textContent = cellDate.getDate();
    cell.appendChild(dateLabel);

    if (eventByDate[dateStr]) {
      for (const ev of eventByDate[dateStr]) {
        const pill = gridEl.ownerDocument.createElement("div");
        pill.className = "cal-month-event" + (isSomaManaged(ev) ? " soma-managed" : "");
        pill.textContent = ev.summary || "(제목 없음)";
        if (ev.htmlLink) {
          pill.addEventListener("click", (e) => {
            e.stopPropagation();
            if (typeof window !== "undefined") window.open(ev.htmlLink, "_blank");
          });
        }
        cell.appendChild(pill);
      }
    }

    frag.appendChild(cell);
  }

  gridEl.appendChild(frag);
}

/**
 * 사이드 패널 본문을 렌더한다.
 */
function renderSidePanel(bodyEl, lectures, emptyMsg) {
  bodyEl.innerHTML = "";
  const frag = bodyEl.ownerDocument.createDocumentFragment();

  if (!lectures || lectures.length === 0) {
    const msg = bodyEl.ownerDocument.createElement("div");
    msg.className = "side-empty-msg";
    msg.textContent = emptyMsg || "현재 신청 가능한 특강이 없습니다.";
    frag.appendChild(msg);
  } else {
    for (const lec of lectures) {
      const card = bodyEl.ownerDocument.createElement("div");
      card.className = "lecture-card";
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", lec.title);

      const startDate = new Date(lec.startAt);
      const endDate = new Date(lec.endAt);
      const timeStr = `${toKSTDateStr(startDate)} ${toKSTTimeStr(startDate)} ~ ${toKSTTimeStr(endDate)}`;

      const titleEl = bodyEl.ownerDocument.createElement("div");
      titleEl.className = "lecture-card-title";
      titleEl.textContent = lec.title;

      const timeEl = bodyEl.ownerDocument.createElement("div");
      timeEl.className = "lecture-card-time";
      timeEl.textContent = timeStr;

      card.appendChild(titleEl);
      card.appendChild(timeEl);

      if (lec.statusText) {
        const statusEl = bodyEl.ownerDocument.createElement("div");
        statusEl.className = "lecture-card-status";
        statusEl.textContent = lec.statusText;
        card.appendChild(statusEl);
      }

      const targetUrl = lec.url || lec.detailUrl;
      if (targetUrl) {
        const openTab = () => {
          if (typeof window !== "undefined") window.open(targetUrl, "_blank");
        };
        card.addEventListener("click", openTab);
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openTab();
          }
        });
      }

      frag.appendChild(card);
    }
  }

  bodyEl.appendChild(frag);
}

/**
 * 빈 lectureSnapshot 관련 안내 메시지를 판별.
 */
function resolveSidePanelEmptyMsg(snapshot, pollingState) {
  if (!snapshot || !snapshot.takenAt) {
    return "백그라운드 폴링이 아직 실행되지 않았습니다. 옵션 열기 또는 지금 갱신을 눌러주세요.";
  }
  if (pollingState?.pausedReason === "auth-expired") {
    return "SoMA 로그인이 만료되었습니다. SoMA 페이지에서 다시 로그인 후 지금 갱신 눌러주세요.";
  }
  return null;
}

/**
 * anchorDate 기준으로 timeMin/timeMax ISO 문자열 반환.
 */
function calcFetchRange(viewMode, anchorDate) {
  const anchorStr = toKSTDateStr(anchorDate);

  if (viewMode === "week") {
    const weekDates = getWeekDates(anchorStr);
    const timeMin = new Date(`${weekDates[0]}T00:00:00+09:00`).toISOString();
    const timeMax = new Date(`${weekDates[6]}T23:59:59+09:00`).toISOString();
    return { timeMin, timeMax };
  }

  const [year, month] = anchorStr.split("-").map(Number);
  const firstDay = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+09:00`);
  const daysInMonth = new Date(year, month, 0).getDate();
  const lastStr = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  return {
    timeMin: firstDay.toISOString(),
    timeMax: new Date(`${lastStr}T23:59:59+09:00`).toISOString()
  };
}

/**
 * anchorDate 기준 기간 라벨 문자열 반환.
 */
function calcPeriodLabel(viewMode, anchorDate) {
  const anchorStr = toKSTDateStr(anchorDate);
  if (viewMode === "week") {
    const dates = getWeekDates(anchorStr);
    return `${dates[0]} ~ ${dates[6]}`;
  }
  const [year, month] = anchorStr.split("-").map(Number);
  return `${year}년 ${month}월`;
}

// CJS export for Node tests; browser global for <script> tag use.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    WEEK_START_HOUR,
    WEEK_END_HOUR,
    calcEventPosition,
    splitEventByDay,
    isOutOfWeekRange,
    isSomaManaged,
    getWeekDates,
    renderWeekGrid,
    renderMonthGrid,
    renderSidePanel,
    resolveSidePanelEmptyMsg,
    calcFetchRange,
    calcPeriodLabel
  };
} else if (typeof window !== "undefined") {
  window.CalendarView = {
    WEEK_START_HOUR,
    WEEK_END_HOUR,
    calcEventPosition,
    splitEventByDay,
    isOutOfWeekRange,
    isSomaManaged,
    getWeekDates,
    renderWeekGrid,
    renderMonthGrid,
    renderSidePanel,
    resolveSidePanelEmptyMsg,
    calcFetchRange,
    calcPeriodLabel
  };
}
