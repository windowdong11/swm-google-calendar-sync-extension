(function () {
  const STATE_KEY = "soma-mock-state-v1";
  const LOG_KEY = "soma-mock-log-v1";
  const DEFAULT_FIXED_NOW = "2026-04-09T12:00:00+09:00";
  const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
  const DEFAULT_SETTINGS = {
    backToBackMinutes: 15,
    allowDirectDelete: false,
    confirmBeforeDelete: true,
    includeTransparentEvents: false,
    selectedCalendarIds: ["primary"]
  };
  const LIST_PAGE_SIZE = 2;

  const DEFAULT_LECTURES = {
    "9439": {
      qustnrSn: "9439",
      title: "[연사A] '판단은 AI, 실행은 코드' - LLM Function Calling 실무 가이드",
      place: "온라인(Webex)",
      startAt: "2026-04-12T20:00:00+09:00",
      endAt: "2026-04-12T22:00:00+09:00",
      capacity: 40
    },
    "9550": {
      qustnrSn: "9550",
      title: "[팀빌딩] 우리 팀, 6개월 버틸 수 있을까",
      place: "온라인(Webex)",
      startAt: "2026-04-12T20:30:00+09:00",
      endAt: "2026-04-12T21:30:00+09:00",
      capacity: 50
    },
    "9660": {
      qustnrSn: "9660",
      title: "오전 바이브코딩 실습",
      place: "서울 강남",
      startAt: "2026-04-10T09:30:00+09:00",
      endAt: "2026-04-10T11:00:00+09:00",
      capacity: 24
    },
    "9777": {
      qustnrSn: "9777",
      title: "삭제 처리된 특강 예시",
      place: "온라인",
      startAt: "2026-04-08T19:00:00+09:00",
      endAt: "2026-04-08T20:30:00+09:00",
      capacity: 30
    },
    "9888": {
      qustnrSn: "9888",
      title: "LLM 평가 자동화 입문",
      place: "온라인(Zoom)",
      startAt: "2026-04-13T14:00:00+09:00",
      endAt: "2026-04-13T16:00:00+09:00",
      capacity: 60
    }
  };

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeDateQueryValue(value) {
    const normalized = normalizeText(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
  }

  function parsePositiveInt(value, fallback = 1) {
    const parsed = Number.parseInt(String(value || ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function getListQueryState(url = new URL(location.href)) {
    return {
      scdate: normalizeDateQueryValue(url.searchParams.get("scdate")),
      ecdate: normalizeDateQueryValue(url.searchParams.get("ecdate")),
      pageIndex: parsePositiveInt(url.searchParams.get("pageIndex"), 1)
    };
  }

  function getLectureDateKey(lecture) {
    return typeof lecture?.startAt === "string" ? lecture.startAt.slice(0, 10) : "";
  }

  function buildListPageUrl(urlLike, overrides = {}) {
    const baseUrl =
      urlLike instanceof URL
        ? new URL(urlLike.toString())
        : new URL(String(urlLike), location.href);
    const nextUrl = new URL(baseUrl.toString());
    const scdate = normalizeDateQueryValue(overrides.scdate ?? nextUrl.searchParams.get("scdate"));
    const ecdate = normalizeDateQueryValue(overrides.ecdate ?? nextUrl.searchParams.get("ecdate"));
    const pageIndex = parsePositiveInt(overrides.pageIndex ?? nextUrl.searchParams.get("pageIndex"), 1);

    if (scdate) {
      nextUrl.searchParams.set("scdate", scdate);
    } else {
      nextUrl.searchParams.delete("scdate");
    }

    if (ecdate) {
      nextUrl.searchParams.set("ecdate", ecdate);
    } else {
      nextUrl.searchParams.delete("ecdate");
    }

    nextUrl.searchParams.set("pageIndex", String(pageIndex));
    return nextUrl.toString();
  }

  function getVisibleListLectures(state, url = new URL(location.href)) {
    const query = getListQueryState(url);
    const sortedLectures = Object.values(state.lectures)
      .filter((lecture) => lecture.qustnrSn !== "9777")
      .sort((left, right) => {
        const byStartAt = left.startAt.localeCompare(right.startAt);
        return byStartAt || left.qustnrSn.localeCompare(right.qustnrSn);
      });

    const filteredLectures = sortedLectures.filter((lecture) => {
      const lectureDate = getLectureDateKey(lecture);
      if (query.scdate && lectureDate < query.scdate) return false;
      if (query.ecdate && lectureDate > query.ecdate) return false;
      return true;
    });

    const totalCount = filteredLectures.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / LIST_PAGE_SIZE));
    const pageIndex = Math.min(query.pageIndex, totalPages);
    const offset = (pageIndex - 1) * LIST_PAGE_SIZE;

    return {
      query: {
        ...query,
        pageIndex
      },
      lectures: filteredLectures.slice(offset, offset + LIST_PAGE_SIZE),
      totalCount,
      totalPages,
      pageIndex
    };
  }

  function lectureSummary(lecture) {
    return lecture.place ? `${lecture.place}-${lecture.title}` : lecture.title;
  }

  function lectureDescription(lecture) {
    return lecture.detailUrl ? `SOMA 특강 신청 일정\n${lecture.detailUrl}` : "SOMA 특강 신청 일정";
  }

  function buildDetailUrl(qustnrSn) {
    const registration = DEFAULT_REGISTRATIONS[qustnrSn];
    return registration?.active
      ? `/mock/view-cancel.html?qustnrSn=${encodeURIComponent(qustnrSn)}`
      : `/mock/view-apply.html?qustnrSn=${encodeURIComponent(qustnrSn)}`;
  }

  function buildManagedEvent(lecture, eventId) {
    return {
      id: eventId,
      title: lectureSummary(lecture),
      startAt: lecture.startAt,
      endAt: lecture.endAt,
      htmlLink: `https://calendar.google.com/calendar/u/0/r/eventedit/${eventId}`,
      calendarId: "primary",
      transparency: "opaque",
      isSomaLecture: true,
      somaQustnrSn: lecture.qustnrSn,
      summary: lectureSummary(lecture),
      location: lecture.place,
      description: lectureDescription(lecture),
      extendedProperties: {
        private: {
          somaManaged: "1",
          somaQustnrSn: lecture.qustnrSn,
          somaLectureTitle: lecture.title,
          somaPlace: lecture.place,
          somaDetailUrl: lecture.detailUrl || ""
        }
      }
    };
  }

  const DEFAULT_REGISTRATIONS = {
    "9439": { qustnrSn: "9439", applySn: "1001", active: true, gubun: "mentoLec" },
    "9550": { qustnrSn: "9550", applySn: "1002", active: true, gubun: "mentoLec" },
    "9660": { qustnrSn: "9660", applySn: "1003", active: true, gubun: "mentoLec" },
    "9777": { qustnrSn: "9777", applySn: "1004", active: false, gubun: "mentoLec", historyState: "삭제" }
  };

  function buildDefaultState() {
    const lectures = deepClone(DEFAULT_LECTURES);
    for (const lecture of Object.values(lectures)) {
      lecture.detailUrl = buildDetailUrl(lecture.qustnrSn);
    }

    const registrations = deepClone(DEFAULT_REGISTRATIONS);
    const calendarEvents = [
      buildManagedEvent(lectures["9439"], "mock-managed-9439"),
      buildManagedEvent(lectures["9550"], "mock-managed-9550"),
      buildManagedEvent(lectures["9660"], "mock-managed-9660"),
      {
        id: "mock-personal-1",
        title: "개인 일정 - 주간 회고",
        startAt: "2026-04-12T19:30:00+09:00",
        endAt: "2026-04-12T20:30:00+09:00",
        htmlLink: "https://calendar.google.com/calendar/u/0/r",
        calendarId: "primary",
        transparency: "opaque",
        isSomaLecture: false,
        somaQustnrSn: ""
      }
    ];

    const mappings = {
      "9439": buildMappingEntry(calendarEvents[0], lectures["9439"]),
      "9550": buildMappingEntry(calendarEvents[1], lectures["9550"]),
      "9660": buildMappingEntry(calendarEvents[2], lectures["9660"])
    };

    return {
      fixedNow: DEFAULT_FIXED_NOW,
      googleConnected: true,
      settings: deepClone(DEFAULT_SETTINGS),
      lectures,
      registrations,
      calendarEvents,
      mappings,
      nextEventSeq: 1
    };
  }

  function getState() {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) {
      const initial = buildDefaultState();
      setState(initial);
      return initial;
    }

    try {
      return JSON.parse(raw);
    } catch (_error) {
      const initial = buildDefaultState();
      setState(initial);
      return initial;
    }
  }

  function setState(state) {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function getLogs() {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return [];
    }
  }

  function setLogs(logs) {
    localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(-100)));
  }

  function pushLog(kind, message) {
    const logs = getLogs();
    logs.push({
      at: new Date().toISOString(),
      kind,
      message
    });
    setLogs(logs);
    renderLogPanel();
  }

  function resetMockState() {
    setState(buildDefaultState());
    setLogs([]);
  }

  function buildMappingEntry(event, lecture) {
    return {
      calendarId: "primary",
      eventId: event.id,
      qustnrSn: lecture.qustnrSn,
      title: lecture.title,
      place: lecture.place,
      summary: lectureSummary(lecture),
      startAt: lecture.startAt,
      endAt: lecture.endAt,
      detailUrl: lecture.detailUrl,
      syncedAt: new Date().toISOString()
    };
  }

  function parseDate(value) {
    return new Date(value);
  }

  function isCancelable(lecture, state) {
    const start = parseDate(lecture.startAt);
    if (Number.isNaN(start.getTime())) return true;
    return start.getTime() - new Date(state.fixedNow).getTime() > 24 * 60 * 60 * 1000;
  }

  function formatDatePart(iso) {
    const date = parseDate(iso);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const weekday = DAY_LABELS[date.getDay()];
    return `${year}-${month}-${day}(${weekday})`;
  }

  function formatTime(iso, keepLeadingZero) {
    const date = parseDate(iso);
    const hourValue = date.getHours();
    const hour = keepLeadingZero ? String(hourValue).padStart(2, "0") : String(hourValue);
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${hour}:${minute}`;
  }

  function formatTimeWithSeconds(iso) {
    const date = parseDate(iso);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
  }

  function formatDetailDate(lecture) {
    const start = parseDate(lecture.startAt);
    const end = parseDate(lecture.endAt);
    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, "0");
    const day = String(start.getDate()).padStart(2, "0");
    return `${year}.${month}.${day} ${formatTime(lecture.startAt, false)} ~ ${formatTime(lecture.endAt, false)}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function getQueryQustnrSn() {
    return new URL(location.href).searchParams.get("qustnrSn") || "";
  }

  function renderToolbar(container, title) {
    const state = getState();
    container.innerHTML = `
      <div class="mock-toolbar">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <div class="mock-meta">기준 시각: ${escapeHtml(state.fixedNow)}</div>
        </div>
        <div class="mock-toolbar__actions">
          <a href="/mock/list.html">list.do</a>
          <a href="/mock/history.html">history.do</a>
          <a href="/mock/view-apply.html?qustnrSn=9888">view.do 신청</a>
          <a href="/mock/view-cancel.html?qustnrSn=9439">view.do 취소</a>
          <button type="button" data-mock-action="reset">상태 초기화</button>
          <button type="button" data-mock-action="delete-9439">9439 캘린더만 삭제</button>
        </div>
      </div>
    `;

    container.querySelector('[data-mock-action="reset"]')?.addEventListener("click", () => {
      resetMockState();
      location.reload();
    });

    container.querySelector('[data-mock-action="delete-9439"]')?.addEventListener("click", () => {
      const stateNow = getState();
      stateNow.calendarEvents = stateNow.calendarEvents.filter((event) => event.somaQustnrSn !== "9439");
      if (stateNow.mappings["9439"]) {
        delete stateNow.mappings["9439"];
      }
      setState(stateNow);
      pushLog("mock", "9439 캘린더 일정만 삭제했습니다.");
      location.reload();
    });
  }

  function buildListRowsHtml(state, lectures, query) {
    if (lectures.length === 0) {
      return `
        <tr>
          <td class="tit" colspan="9">조건에 맞는 특강이 없습니다.</td>
        </tr>
      `;
    }

    return lectures
      .map((lecture) => {
        const href = buildListPageUrl(
          `/mock/${state.registrations[lecture.qustnrSn]?.active ? "view-cancel" : "view-apply"}.html?qustnrSn=${encodeURIComponent(lecture.qustnrSn)}`,
          {
            scdate: query.scdate,
            ecdate: query.ecdate,
            pageIndex: query.pageIndex
          }
        );
        const scheduleText = `${formatDatePart(lecture.startAt)} ${formatTime(lecture.startAt, false)} ~ ${formatTime(lecture.endAt, false)}`;
        return `
          <tr>
            <td class="tit">
              <div class="rel">
                <a href="${href}">${escapeHtml(lecture.title)}</a>
              </div>
            </td>
            <td class="pc_only">멘토</td>
            <td class="pc_only">분야</td>
            <td class="pc_only">${escapeHtml(scheduleText)}</td>
            <td class="pc_only">${escapeHtml(lecture.place)}</td>
            <td class="pc_only">${state.registrations[lecture.qustnrSn]?.active ? "신청완료" : "접수중"}</td>
            <td class="pc_only">${lecture.capacity}</td>
            <td class="pc_only">온라인</td>
            <td class="pc_only">비고</td>
          </tr>
        `;
      })
      .join("");
  }

  function buildListPaginationHtml(url, listState) {
    const pageLinks = [];

    for (let pageIndex = 1; pageIndex <= listState.totalPages; pageIndex += 1) {
      if (pageIndex === listState.pageIndex) {
        pageLinks.push(`<span class="mock-page mock-page--active">${pageIndex}</span>`);
        continue;
      }

      pageLinks.push(
        `<a class="mock-page" href="${buildListPageUrl(url, {
          scdate: listState.query.scdate,
          ecdate: listState.query.ecdate,
          pageIndex
        })}">${pageIndex}</a>`
      );
    }

    return `
      <div class="pagination">
        <span data-endpage="${listState.totalPages}" style="display:none">${listState.totalPages}</span>
        ${pageLinks.join("")}
      </div>
    `;
  }

  function buildHistoryRowsHtml(state) {
    const registrations = Object.values(state.registrations);
    return registrations
      .map((registration) => {
        const lecture = state.lectures[registration.qustnrSn];
        if (!lecture) return "";

        const scheduleText = `${formatDatePart(lecture.startAt)} ${formatTimeWithSeconds(lecture.startAt)} ~ ${formatTimeWithSeconds(lecture.endAt)}`;
        const isRemoved = !registration.active;
        const titleCell = isRemoved
          ? escapeHtml(lecture.title)
          : `<a href="/mock/view-cancel.html?qustnrSn=${encodeURIComponent(lecture.qustnrSn)}">${escapeHtml(lecture.title)}</a>`;
        const cancelLink = registration.active && isCancelable(lecture, state)
          ? `<a href="javascript:delDate('${registration.applySn}','${lecture.qustnrSn}','mentoLec')">취소</a>`
          : "";
        const statusText = registration.active ? "접수완료" : "접수대기";
        const historyStateText = registration.active ? "" : "삭제";

        return `
          <tr>
            <td>1</td>
            <td class="tit">${titleCell}</td>
            <td>멘토</td>
            <td>${escapeHtml(lecture.place)}</td>
            <td>${escapeHtml(scheduleText)}</td>
            <td>${cancelLink}</td>
            <td>${statusText}</td>
            <td>정상</td>
            <td>${historyStateText}</td>
          </tr>
        `;
      })
      .join("");
  }

  function buildGroupsHtml(lecture) {
    return `
      <div class="bbs-view-new">
        <div class="group"><div class="t">모집 명</div><div class="c">${escapeHtml(lecture.title)}</div></div>
        <div class="group"><div class="t">장소</div><div class="c">${escapeHtml(lecture.place)}</div></div>
        <div class="group"><div class="t">강의날짜</div><div class="c">${escapeHtml(formatDetailDate(lecture))}</div></div>
        <div class="group"><div class="t">모집인원</div><div class="c">${lecture.capacity}명</div></div>
      </div>
    `;
  }

  function renderListPage(container) {
    const state = getState();
    const listState = getVisibleListLectures(state);
    container.innerHTML = `
      <div class="bbs-top">
        <a href="/sw/member/user/logout.do">로그아웃</a>
        <a href="/sw/mypage/myMain/main.do?menuNo=200026">MY PAGE</a>
      </div>
      <div class="mock-meta">총 ${listState.totalCount}건 · ${listState.pageIndex}/${listState.totalPages} 페이지</div>
      <div class="boardlist">
        <table class="t">
          <tbody>${buildListRowsHtml(state, listState.lectures, listState.query)}</tbody>
        </table>
      </div>
      ${buildListPaginationHtml(location.href, listState)}
    `;
  }

  function renderHistoryPage(container) {
    const state = getState();
    container.innerHTML = `
      <div class="boardlist">
        <table>
          <tbody>${buildHistoryRowsHtml(state)}</tbody>
        </table>
      </div>
      <div class="pagination">
        <span data-endpage="1">1</span>
      </div>
    `;
  }

  function renderViewPage(container, allowCancel) {
    const state = getState();
    const fallbackId = allowCancel ? "9439" : "9888";
    const qustnrSn = getQueryQustnrSn() || fallbackId;
    const lecture = state.lectures[qustnrSn] || state.lectures[fallbackId];
    const registration = state.registrations[lecture.qustnrSn];
    const appliedCount = Object.values(state.registrations).filter((item) => item.active).length;
    const cancelButton = allowCancel && registration?.active
      ? `<button type="button" onclick="applyCancel('${lecture.qustnrSn}','${registration.applySn}')">취소하기</button>`
      : "";
    const applyButton = !allowCancel ? `<button id="applyLec" type="button">신청하기</button>` : "";

    container.innerHTML = `
      <a href="/sw/member/user/logout.do">로그아웃</a>
      <a href="/sw/mypage/myMain/main.do?menuNo=200026">MY PAGE</a>
      <input type="hidden" name="qustnrSn" value="${lecture.qustnrSn}">
      ${buildGroupsHtml(lecture)}
      <div class="boardlist">
        <table>
          <tbody>
            ${registration?.active ? `<tr><td>[신청완료] ${escapeHtml(lecture.title)}</td></tr>` : ""}
            <tr><td>현재 신청 인원: ${appliedCount}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="mock-buttons">
        ${applyButton}
        ${cancelButton}
      </div>
    `;
  }

  function renderLogPanel() {
    const target = document.getElementById("mock-log");
    if (!target) return;
    const logs = getLogs();
    target.textContent = logs
      .slice(-20)
      .map((entry) => `[${entry.kind}] ${entry.message}`)
      .join("\n");
  }

  function renderCurrentPage() {
    const scenario = document.body.dataset.scenario || "list";
    const toolbar = document.getElementById("mock-toolbar");
    const app = document.getElementById("app");
    if (!toolbar || !app) return;

    if (scenario === "list") {
      renderToolbar(toolbar, "mock list.do");
      renderListPage(app);
    } else if (scenario === "history") {
      renderToolbar(toolbar, "mock history.do");
      renderHistoryPage(app);
    } else if (scenario === "view-apply") {
      renderToolbar(toolbar, "mock view.do 신청");
      renderViewPage(app, false);
    } else if (scenario === "view-cancel") {
      renderToolbar(toolbar, "mock view.do 취소");
      renderViewPage(app, true);
    }

    renderLogPanel();
  }

  function updateRegistrationActive(state, qustnrSn, active) {
    const registration = state.registrations[qustnrSn] || {
      qustnrSn,
      applySn: String(2000 + Object.keys(state.registrations).length),
      gubun: "mentoLec"
    };
    registration.active = active;
    registration.historyState = active ? "" : "삭제";
    state.registrations[qustnrSn] = registration;
    return state;
  }

  function deleteManagedEvent(state, lectureLike) {
    const beforeLength = state.calendarEvents.length;
    state.calendarEvents = state.calendarEvents.filter((event) => {
      if (!event.isSomaLecture) return true;
      if (lectureLike.qustnrSn && event.somaQustnrSn === lectureLike.qustnrSn) return false;
      return !(
        event.startAt === lectureLike.startAt &&
        event.endAt === lectureLike.endAt &&
        event.title === lectureSummary(lectureLike)
      );
    });
    if (lectureLike.qustnrSn) {
      delete state.mappings[lectureLike.qustnrSn];
    }
    return beforeLength - state.calendarEvents.length;
  }

  function upsertManagedEvent(state, payload) {
    const lecture = {
      ...state.lectures[payload.qustnrSn],
      ...payload
    };
    lecture.detailUrl = payload.detailUrl || state.lectures[payload.qustnrSn]?.detailUrl || buildDetailUrl(payload.qustnrSn);
    lecture.place = payload.place || state.lectures[payload.qustnrSn]?.place || "";
    lecture.title = payload.title || state.lectures[payload.qustnrSn]?.title || "";

    const existingIndex = state.calendarEvents.findIndex((event) => event.somaQustnrSn === lecture.qustnrSn);
    let status = "created";
    let event;

    if (existingIndex >= 0) {
      event = buildManagedEvent(lecture, state.calendarEvents[existingIndex].id);
      state.calendarEvents[existingIndex] = event;
      status = "updated";
    } else {
      const mapping = state.mappings[lecture.qustnrSn];
      const eventId = mapping?.eventId || `mock-managed-${lecture.qustnrSn}-${state.nextEventSeq++}`;
      event = buildManagedEvent(lecture, eventId);
      state.calendarEvents.push(event);
      status = "created";
    }

    if (
      state.mappings[lecture.qustnrSn] &&
      state.mappings[lecture.qustnrSn].startAt === lecture.startAt &&
      state.mappings[lecture.qustnrSn].endAt === lecture.endAt &&
      state.mappings[lecture.qustnrSn].summary === lectureSummary(lecture)
    ) {
      status = "unchanged";
    }

    state.mappings[lecture.qustnrSn] = buildMappingEntry(event, lecture);
    state.lectures[lecture.qustnrSn] = lecture;
    return { state, status, mapping: state.mappings[lecture.qustnrSn] };
  }

  function syncSourceLectures(state, payload) {
    const activeLectures = payload.lectures || [];
    const inactiveLectures = payload.inactiveLectures || [];
    const stats = {
      created: 0,
      updated: 0,
      unchanged: 0,
      deleted: 0,
      removed: 0,
      pruned: 0
    };
    const details = [];

    for (const lecture of inactiveLectures) {
      const deletedCount = deleteManagedEvent(state, lecture);
      if (deletedCount > 0) {
        stats.deleted += deletedCount;
        stats.removed += 1;
      }
      details.push({
        qustnrSn: lecture.qustnrSn || "",
        title: lecture.title,
        startAt: lecture.startAt,
        action: "remove",
        deletedCount
      });
      if (lecture.qustnrSn && state.registrations[lecture.qustnrSn]) {
        state.registrations[lecture.qustnrSn].active = false;
        state.registrations[lecture.qustnrSn].historyState = "삭제";
      }
    }

    const activeIds = new Set();
    for (const lecture of activeLectures) {
      activeIds.add(lecture.qustnrSn);
      const result = upsertManagedEvent(state, lecture);
      stats[result.status] += 1;
      details.push({
        qustnrSn: lecture.qustnrSn,
        title: lecture.title,
        startAt: lecture.startAt,
        action: result.status,
        eventId: result.mapping.eventId,
        summary: result.mapping.summary
      });
      updateRegistrationActive(state, lecture.qustnrSn, true);
    }

    if (payload.sourceComplete) {
      for (const qustnrSn of Object.keys(state.mappings)) {
        if (activeIds.has(qustnrSn)) continue;
        const mapping = state.mappings[qustnrSn];
        const deletedCount = deleteManagedEvent(state, mapping);
        if (deletedCount > 0) {
          stats.deleted += deletedCount;
        } else {
          stats.pruned += 1;
        }
      }
    }

    return {
      ok: true,
      stats,
      mappingCount: Object.keys(state.mappings).length,
      details
    };
  }

  async function handleSendMessage(message) {
    const state = getState();
    pushLog("message", message.type);

    if (message.type === "GET_SETTINGS") {
      return { ok: true, settings: state.settings };
    }

    if (message.type === "AUTH_CONNECT_GOOGLE") {
      state.googleConnected = true;
      setState(state);
      return { ok: true };
    }

    if (message.type === "GET_CALENDAR_EVENTS") {
      return { ok: true, events: deepClone(state.calendarEvents) };
    }

    if (message.type === "DELETE_CALENDAR_EVENT") {
      state.calendarEvents = state.calendarEvents.filter((event) => !(event.calendarId === message.payload.calendarId && event.id === message.payload.eventId));
      setState(state);
      return { ok: true };
    }

    if (message.type === "GET_LECTURE_MAPPINGS") {
      const wanted = new Set(message.payload?.qustnrSns || []);
      const mappings = {};
      for (const [qustnrSn, mapping] of Object.entries(state.mappings)) {
        if (wanted.size === 0 || wanted.has(qustnrSn)) {
          mappings[qustnrSn] = mapping;
        }
      }
      return { ok: true, mappings };
    }

    if (message.type === "UPSERT_SOURCE_LECTURE") {
      const result = upsertManagedEvent(state, message.payload);
      setState(state);
      return { ok: true, status: result.status, mapping: result.mapping };
    }

    if (message.type === "DELETE_CALENDAR_EVENT_BY_LECTURE") {
      const deletedCount = deleteManagedEvent(state, message.payload);
      setState(state);
      return { ok: true, deletedCount };
    }

    if (message.type === "SYNC_SOURCE_LECTURES") {
      const result = syncSourceLectures(state, message.payload || {});
      setState(state);
      return result;
    }

    return { ok: false, error: `Mock에서 지원하지 않는 메시지입니다: ${message.type}` };
  }

  function buildListDocument(state, url) {
    const listState = getVisibleListLectures(state, url);
    return `<!DOCTYPE html>
      <html lang="ko">
        <body>
          <div class="bbs-top">
            <a href="/sw/member/user/logout.do">로그아웃</a>
            <a href="/sw/mypage/myMain/main.do?menuNo=200026">MY PAGE</a>
          </div>
          <div class="boardlist">
            <table class="t">
              <tbody>${buildListRowsHtml(state, listState.lectures, listState.query)}</tbody>
            </table>
          </div>
          ${buildListPaginationHtml(url, listState)}
        </body>
      </html>`;
  }

  function buildHistoryDocument(state) {
    return `<!DOCTYPE html>
      <html lang="ko">
        <body>
          <div class="boardlist">
            <table>
              <tbody>${buildHistoryRowsHtml(state)}</tbody>
            </table>
          </div>
          <div class="pagination"><span data-endpage="1">1</span></div>
        </body>
      </html>`;
  }

  function buildDetailDocument(state, qustnrSn, allowCancel) {
    const lecture = state.lectures[qustnrSn] || state.lectures["9888"];
    const registration = state.registrations[lecture.qustnrSn];
    const appliedCount = Object.values(state.registrations).filter((item) => item.active).length;
    const controls = allowCancel && registration?.active
      ? `<button type="button" onclick="applyCancel('${lecture.qustnrSn}','${registration.applySn}')">취소하기</button>`
      : `<button id="applyLec" type="button">신청하기</button>`;
    return `<!DOCTYPE html>
      <html lang="ko">
        <body>
          <a href="/sw/member/user/logout.do">로그아웃</a>
          <a href="/sw/mypage/myMain/main.do?menuNo=200026">MY PAGE</a>
          <input type="hidden" name="qustnrSn" value="${lecture.qustnrSn}">
          ${buildGroupsHtml(lecture)}
          <div class="boardlist">
            <table>
              <tbody>
                ${registration?.active ? `<tr><td>[신청완료] ${escapeHtml(lecture.title)}</td></tr>` : ""}
                <tr><td>현재 신청 인원: ${appliedCount}</td></tr>
              </tbody>
            </table>
          </div>
          ${controls}
        </body>
      </html>`;
  }

  function makeJsonResponse(payload) {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  function makeHtmlResponse(payload) {
    return new Response(payload, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8"
      }
    });
  }

  function installFetchMock() {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url, location.href);
      const state = getState();
      pushLog("fetch", `${init.method || "GET"} ${url.pathname}`);

      if (url.pathname === "/sw/mypage/mentoLec/list.do" || url.pathname === "/mock/list.html") {
        return makeHtmlResponse(buildListDocument(state, url));
      }

      if (url.pathname === "/sw/mypage/userAnswer/history.do" || url.pathname === "/mock/history.html") {
        return makeHtmlResponse(buildHistoryDocument(state));
      }

      if (url.pathname === "/mock/view-apply.html") {
        return makeHtmlResponse(buildDetailDocument(state, url.searchParams.get("qustnrSn") || "9888", false));
      }

      if (url.pathname === "/mock/view-cancel.html") {
        return makeHtmlResponse(buildDetailDocument(state, url.searchParams.get("qustnrSn") || "9439", true));
      }

      if (url.pathname === "/sw/mypage/mentoLec/apply.json") {
        const body = new URLSearchParams(init.body || "");
        const qustnrSn = body.get("qustnrSn") || "";
        const nextState = getState();
        updateRegistrationActive(nextState, qustnrSn, true);
        setState(nextState);
        pushLog("mock", `${qustnrSn} 신청 처리`);
        return makeJsonResponse({
          resultCode: "success",
          msg: "신청 하였습니다.",
          state: nextState
        });
      }

      if (url.pathname === "/sw/mypage/mentoLec/applyCancel.json" || url.pathname === "/sw/mypage/userAnswer/cancel.json") {
        const body = new URLSearchParams(init.body || "");
        const qustnrSn = body.get("qustnrSn") || "";
        const currentState = getState();
        const lecture = currentState.lectures[qustnrSn];
        if (!lecture || !isCancelable(lecture, currentState)) {
          return makeJsonResponse({
            resultCode: "success",
            cancelAt: "N"
          });
        }

        updateRegistrationActive(currentState, qustnrSn, false);
        setState(currentState);
        pushLog("mock", `${qustnrSn} 취소 처리`);
        return makeJsonResponse({
          resultCode: "success",
          cancelAt: "Y"
        });
      }

      return realFetch(input, init);
    };
  }

  function installChromeMock() {
    window.chrome = window.chrome || {};
    window.chrome.runtime = window.chrome.runtime || {};
    window.chrome.runtime.sendMessage = handleSendMessage;
  }

  function installDialogMocks() {
    window.alert = (message) => {
      pushLog("alert", String(message));
    };
    window.confirm = (message) => {
      pushLog("confirm", String(message));
      return true;
    };
  }

  function installDateNowMock() {
    Date.now = () => new Date(getState().fixedNow).getTime();
  }

  window.applyCancel = function applyCancel() {};
  window.delDate = function delDate() {};

  installChromeMock();
  installFetchMock();
  installDialogMocks();
  installDateNowMock();

  window.SomaMock = {
    getState,
    resetMockState,
    renderCurrentPage
  };

  document.addEventListener("DOMContentLoaded", () => {
    renderCurrentPage();
  });
})();
