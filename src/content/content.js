(async function () {
  const EXT = {
    badgeClass: "soma-badge",
    panelRowClass: "soma-panel-row",
    summaryClass: "soma-summary",
    filterClass: "soma-filter-bar",
    queryBarClass: "soma-query-bar",
    noteClass: "soma-note",
    authBannerClass: "soma-auth-banner",
    statusBannerClass: "soma-status-banner"
  };

  function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
  }

  function normalizeText(value) {
    return typeof value === "string" ? value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() : "";
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

  function buildListPageUrl({ scdate = "", ecdate = "", pageIndex = 1 } = {}) {
    const url = new URL(location.href);

    if (scdate) {
      url.searchParams.set("scdate", scdate);
    } else {
      url.searchParams.delete("scdate");
    }

    if (ecdate) {
      url.searchParams.set("ecdate", ecdate);
    } else {
      url.searchParams.delete("ecdate");
    }

    url.searchParams.set("pageIndex", String(parsePositiveInt(pageIndex, 1)));
    return url.toString();
  }

  function renderListQueryBar(host) {
    host.querySelector(`.${EXT.queryBarClass}`)?.remove();

    const currentQuery = getListQueryState();
    const bar = document.createElement("div");
    bar.className = EXT.queryBarClass;

    const title = document.createElement("div");
    title.className = "soma-query-bar__title";
    title.textContent = "날짜 기준 목록 조회";
    bar.appendChild(title);

    const startField = document.createElement("label");
    startField.className = "soma-query-bar__field";
    startField.textContent = "시작일";

    const startInput = document.createElement("input");
    startInput.type = "date";
    startInput.value = currentQuery.scdate;
    startField.appendChild(startInput);
    bar.appendChild(startField);

    const endField = document.createElement("label");
    endField.className = "soma-query-bar__field";
    endField.textContent = "종료일";

    const endInput = document.createElement("input");
    endInput.type = "date";
    endInput.value = currentQuery.ecdate;
    endField.appendChild(endInput);
    bar.appendChild(endField);

    const actions = document.createElement("div");
    actions.className = "soma-query-bar__actions";

    function validateDateRange(scdate, ecdate) {
      if (scdate && ecdate && scdate > ecdate) {
        window.alert("시작일은 종료일보다 늦을 수 없습니다.");
        return false;
      }
      return true;
    }

    function applyQuery({ keepPageIndex }) {
      const nextQuery = {
        scdate: normalizeDateQueryValue(startInput.value),
        ecdate: normalizeDateQueryValue(endInput.value),
        pageIndex: keepPageIndex ? currentQuery.pageIndex : 1
      };

      if (!validateDateRange(nextQuery.scdate, nextQuery.ecdate)) {
        return;
      }

      location.href = buildListPageUrl(nextQuery);
    }

    const applyDateButton = document.createElement("button");
    applyDateButton.type = "button";
    applyDateButton.textContent = "날짜 조회";
    applyDateButton.addEventListener("click", () => applyQuery({ keepPageIndex: false }));
    actions.appendChild(applyDateButton);

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "초기화";
    resetButton.dataset.kind = "secondary";
    resetButton.addEventListener("click", () => {
      location.href = buildListPageUrl({
        scdate: "",
        ecdate: "",
        pageIndex: 1
      });
    });
    actions.appendChild(resetButton);

    for (const input of [startInput, endInput]) {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          applyQuery({ keepPageIndex: false });
        }
      });
    }

    bar.appendChild(actions);

    const meta = document.createElement("div");
    meta.className = "soma-query-bar__meta";
    meta.textContent = "URL 쿼리 scdate, ecdate를 이용해 목록 조건을 바꾸고, pageIndex는 기존 페이지 버튼을 그대로 사용합니다.";
    bar.appendChild(meta);

    host.prepend(bar);
  }

  function parseLecturesFromPage(doc) {
    const rows = Array.from(doc.querySelectorAll(".boardlist table.t tbody tr"));
    const lectures = [];

    for (const row of rows) {
      const titleLink = row.querySelector("td.tit a");
      if (!titleLink) continue;

      const href = titleLink.getAttribute("href") || "";
      const idMatch = href.match(/qustnrSn=(\d+)/);
      const id = idMatch?.[1];
      if (!id) continue;

      const tds = Array.from(row.querySelectorAll("td.pc_only"));
      if (tds.length < 8) continue;

      const dateCell = tds[2];
      const rawText = (dateCell.innerText || "").trim();
      const normalized = normalizeText(rawText);
      const dateMatch = normalized.match(/(\d{4}-\d{2}-\d{2})\([^)]+\)/);
      const timeMatches = [...normalized.matchAll(/(\d{1,2}):(\d{2})/g)];

      if (!dateMatch || timeMatches.length < 2) {
        lectures.push({
          id,
          title: titleLink.textContent?.trim() || "",
          url: new URL(href, location.origin).toString(),
          startAt: "",
          endAt: "",
          parseFailed: true,
          statusText: "접수중",
          rawText
        });
        continue;
      }

      const date = dateMatch[1];
      const startTime = `${timeMatches[0][1].padStart(2, "0")}:${timeMatches[0][2]}`;
      const endTime = `${timeMatches[1][1].padStart(2, "0")}:${timeMatches[1][2]}`;

      lectures.push({
        id,
        title: titleLink.textContent?.trim() || "",
        url: new URL(href, location.origin).toString(),
        startAt: `${date}T${startTime}:00+09:00`,
        endAt: `${date}T${endTime}:00+09:00`,
        parseFailed: false,
        statusText: "접수중",
        rawText
      });
    }

    return lectures;
  }

  function mapLectureRows(doc) {
    const rows = Array.from(doc.querySelectorAll(".boardlist table.t tbody tr"));
    const map = new Map();

    for (const row of rows) {
      const titleLink = row.querySelector("td.tit a");
      const href = titleLink?.getAttribute("href") || "";
      const idMatch = href.match(/qustnrSn=(\d+)/);
      const id = idMatch?.[1];
      if (id) map.set(id, row);
    }

    return map;
  }

  function classifyLecture(lecture, events, backToBackMinutes) {
    if (lecture.parseFailed || !lecture.startAt || !lecture.endAt) {
      return {
        lectureId: lecture.id,
        status: "UNKNOWN",
        conflictingEvents: []
      };
    }

    const lectureStart = new Date(lecture.startAt).getTime();
    const lectureEnd = new Date(lecture.endAt).getTime();

    const conflictingEvents = events.filter((event) => {
      const eventStart = new Date(event.startAt).getTime();
      const eventEnd = new Date(event.endAt).getTime();
      return lectureStart < eventEnd && eventStart < lectureEnd;
    });

    if (conflictingEvents.length > 0) {
      return {
        lectureId: lecture.id,
        status: "OVERLAP",
        conflictingEvents
      };
    }

    const thresholdMs = backToBackMinutes * 60 * 1000;
    let adjacentPreviousEvent;
    let bestGap = Number.POSITIVE_INFINITY;

    for (const event of events) {
      const eventEnd = new Date(event.endAt).getTime();
      const gap = lectureStart - eventEnd;
      if (gap >= 0 && gap <= thresholdMs && gap < bestGap) {
        bestGap = gap;
        adjacentPreviousEvent = event;
      }
    }

    if (adjacentPreviousEvent) {
      return {
        lectureId: lecture.id,
        status: "BACK_TO_BACK_PREV",
        conflictingEvents: [],
        adjacentPreviousEvent,
        gapMinutes: Math.round(bestGap / 60000)
      };
    }

    return {
      lectureId: lecture.id,
      status: "CLEAR",
      conflictingEvents: []
    };
  }

  function formatDateTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function parseHistoryDateText(rawText) {
    const normalized = normalizeText(rawText);
    const dateMatch = normalized.match(/(\d{4})-(\d{2})-(\d{2})/);
    const timeMatches = [...normalized.matchAll(/(\d{1,2}):(\d{2}):(\d{2})/g)];

    if (!dateMatch || timeMatches.length < 2) {
      return null;
    }

    const [, year, month, day] = dateMatch;
    const date = `${year}-${month}-${day}`;
    return {
      startAt: `${date}T${timeMatches[0][1].padStart(2, "0")}:${timeMatches[0][2]}:${timeMatches[0][3]}+09:00`,
      endAt: `${date}T${timeMatches[1][1].padStart(2, "0")}:${timeMatches[1][2]}:${timeMatches[1][3]}+09:00`
    };
  }

  function getHistoryLastPage(doc) {
    const pages = [1];

    doc.querySelectorAll(".pagination [data-endpage]").forEach((element) => {
      const value = Number.parseInt(element.getAttribute("data-endpage") || "", 10);
      if (Number.isFinite(value)) {
        pages.push(value);
      }
    });

    doc.querySelectorAll(".pagination *").forEach((element) => {
      const value = Number.parseInt(normalizeText(element.textContent), 10);
      if (Number.isFinite(value)) {
        pages.push(value);
      }
    });

    return Math.max(...pages);
  }

  async function fetchHtmlDocument(url) {
    const response = await fetch(url, {
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error(`페이지를 불러오지 못했습니다. (${response.status})`);
    }

    const html = await response.text();
    return new DOMParser().parseFromString(html, "text/html");
  }

  function parseHistoryRegistrationRow(row) {
    const cells = Array.from(row.querySelectorAll("td"));
    if (cells.length < 9) return null;

    const statusText = normalizeText(cells[6]?.textContent);
    if (!statusText.includes("접수완료")) {
      return null;
    }

    const titleCell = row.querySelector("td.tit");
    const title = normalizeText(titleCell?.textContent);
    const link = titleCell?.querySelector("a");
    const href = link?.getAttribute("href") || "";
    const qustnrSn = href.match(/qustnrSn=(\d+)/)?.[1] || "";
    const schedule = parseHistoryDateText(cells[4]?.textContent || "");
    const cancelHref = row.querySelector('a[href^="javascript:delDate("]')?.getAttribute("href") || "";
    const cancelMatch = cancelHref.match(/delDate\('([^']+)','([^']+)',\s*'([^']+)'\)/);

    if (!title || !qustnrSn || !schedule) {
      return null;
    }

    return {
      qustnrSn,
      title,
      detailUrl: href ? new URL(href, location.origin).toString() : "",
      startAt: schedule.startAt,
      endAt: schedule.endAt,
      applySn: cancelMatch?.[1] || "",
      gubun: cancelMatch?.[3] || "mentoLec"
    };
  }

  function parseHistoryRegistrations(doc) {
    const rows = Array.from(doc.querySelectorAll(".boardlist table tbody tr"));
    return rows
      .map((row) => parseHistoryRegistrationRow(row))
      .filter(Boolean);
  }

  async function collectHistoryRegistrations() {
    const baseUrl = new URL("/sw/mypage/userAnswer/history.do?menuNo=200047", location.origin);
    const firstDoc = await fetchHtmlDocument(baseUrl.toString());
    const lastPage = getHistoryLastPage(firstDoc);
    const registrations = new Map();

    for (let pageIndex = 1; pageIndex <= lastPage; pageIndex += 1) {
      const doc = pageIndex === 1
        ? firstDoc
        : await fetchHtmlDocument(`${baseUrl.toString()}&pageIndex=${pageIndex}`);
      const rows = parseHistoryRegistrations(doc);
      for (const registration of rows) {
        registrations.set(registration.qustnrSn, registration);
      }
    }

    return registrations;
  }

  async function syncFromHistorySource() {
    const registrations = await collectHistoryRegistrations();
    const response = await sendMessage({
      type: "SYNC_SOURCE_LECTURES",
      payload: {
        lectures: Array.from(registrations.values()).map((registration) => ({
          qustnrSn: registration.qustnrSn,
          title: registration.title,
          startAt: registration.startAt,
          endAt: registration.endAt,
          detailUrl: registration.detailUrl
        })),
        sourceComplete: true
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "접수내역 기반 동기화에 실패했습니다.");
    }

    return response;
  }

  function findOverlapLectureRegistration(event, currentLectureId, historyRegistrations) {
    if (!event?.somaQustnrSn || !historyRegistrations?.size) {
      return null;
    }

    const registration = historyRegistrations.get(event.somaQustnrSn) || null;
    if (!registration || registration.qustnrSn === currentLectureId) {
      return null;
    }

    return registration;
  }

  function buildConflictEventText(event, overlapRegistration) {
    const base = `${event.title} (${formatDateTime(event.startAt)} ~ ${formatDateTime(event.endAt)})`;

    if (overlapRegistration?.applySn && canCancelRegistration(overlapRegistration)) {
      return `${base} · 신청한 다른 특강`;
    }

    if (overlapRegistration?.applySn) {
      return `${base} · 신청한 다른 특강(24시간 이내 취소 불가)`;
    }

    if (overlapRegistration) {
      return `${base} · 신청한 다른 특강(여기서 취소 불가)`;
    }

    if (event.isSomaLecture) {
      return `${base} · SOMA 특강 일정`;
    }

    return base;
  }

  function canCancelRegistration(registration) {
    const startTime = new Date(registration?.startAt || "");
    if (Number.isNaN(startTime.getTime())) {
      return true;
    }

    return startTime.getTime() - Date.now() > 24 * 60 * 60 * 1000;
  }

  function clearInjectedUI() {
    document.querySelectorAll(`.${EXT.badgeClass}, .${EXT.panelRowClass}, .${EXT.summaryClass}, .${EXT.filterClass}, .${EXT.queryBarClass}, .${EXT.noteClass}, .${EXT.authBannerClass}, .${EXT.statusBannerClass}`).forEach((el) => el.remove());
    document.querySelectorAll("[data-soma-hidden='1']").forEach((el) => {
      el.style.display = "";
      el.removeAttribute("data-soma-hidden");
    });
  }

  function createBadge(decision) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = EXT.badgeClass;

    if (decision.status === "OVERLAP") {
      btn.textContent = `❌ 겹침 (${decision.conflictingEvents.length})`;
      btn.dataset.status = "overlap";
    } else if (decision.status === "BACK_TO_BACK_PREV") {
      btn.textContent = "⚠️ 바로 이어짐";
      btn.dataset.status = "adjacent";
    } else if (decision.status === "UNKNOWN") {
      btn.textContent = "⚪ 시간 확인 필요";
      btn.dataset.status = "unknown";
    } else {
      btn.textContent = "✅ 겹치지 않음";
      btn.dataset.status = "clear";
    }

    return btn;
  }

  function createPanel(decision, settings, lecture, registration, historyRegistrations, onDelete, onCancelLecture) {
    const panel = document.createElement("div");
    panel.className = "soma-panel";
    panel.hidden = true;

    if (decision.status === "OVERLAP") {
      const title = document.createElement("div");
      title.className = "soma-panel-title";
      title.textContent = `겹치는 일정 ${decision.conflictingEvents.length}개`;
      panel.appendChild(title);

      for (const event of decision.conflictingEvents) {
        const item = document.createElement("div");
        item.className = "soma-panel-item";
        const overlapRegistration = findOverlapLectureRegistration(event, lecture.id, historyRegistrations);

        const text = document.createElement("div");
        text.className = "soma-panel-text";
        text.textContent = buildConflictEventText(event, overlapRegistration);

        const actions = document.createElement("div");
        actions.className = "soma-panel-actions";

        if (event.htmlLink) {
          const openBtn = document.createElement("a");
          openBtn.href = event.htmlLink;
          openBtn.target = "_blank";
          openBtn.rel = "noopener noreferrer";
          openBtn.textContent = "캘린더에서 열기";
          openBtn.className = "soma-link-btn";
          actions.appendChild(openBtn);
        }

        if (settings.allowDirectDelete) {
          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "soma-danger-btn";
          delBtn.textContent = "삭제";
          delBtn.addEventListener("click", () => onDelete(event.calendarId, event.id));
          actions.appendChild(delBtn);
        }

        if (overlapRegistration) {
          const cancelBtn = document.createElement("button");
          cancelBtn.type = "button";
          cancelBtn.className = "soma-danger-btn";
          cancelBtn.textContent = "겹친 특강 취소";
          cancelBtn.disabled = !overlapRegistration.applySn || !canCancelRegistration(overlapRegistration);
          cancelBtn.addEventListener("click", () => onCancelLecture(overlapRegistration, cancelBtn));
          actions.appendChild(cancelBtn);
        }

        item.appendChild(text);
        item.appendChild(actions);
        panel.appendChild(item);
      }

      const lectureActionRow = document.createElement("div");
      lectureActionRow.className = "soma-panel-item";

      const lectureActionText = document.createElement("div");
      lectureActionText.className = "soma-panel-text";

      const lectureActionActions = document.createElement("div");
      lectureActionActions.className = "soma-panel-actions";

      const detailLink = document.createElement("a");
      detailLink.href = lecture.url;
      detailLink.target = "_blank";
      detailLink.rel = "noopener noreferrer";
      detailLink.textContent = "특강 상세 보기";
      detailLink.className = "soma-link-btn";
      lectureActionActions.appendChild(detailLink);

      if (registration) {
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "soma-danger-btn";
        cancelBtn.textContent = "이 특강 취소";
        cancelBtn.disabled = !registration.applySn || !canCancelRegistration(registration);
        cancelBtn.addEventListener("click", () => onCancelLecture(registration, cancelBtn));
        lectureActionActions.appendChild(cancelBtn);

        lectureActionText.textContent = registration.applySn
          ? canCancelRegistration(registration)
            ? "이미 신청한 특강입니다. 특강 취소 후 접수내역 기준으로 다시 동기화할 수 있습니다."
            : "특강 시작 24시간 이내라서 여기서는 취소할 수 없습니다."
          : "현재 접수내역 기준으로는 이 특강을 바로 취소할 수 없습니다.";
      } else {
        lectureActionText.textContent = "접수내역에 없는 특강이라서 여기서 바로 취소할 수 없습니다.";
      }

      lectureActionRow.appendChild(lectureActionText);
      lectureActionRow.appendChild(lectureActionActions);
      panel.appendChild(lectureActionRow);
    } else if (decision.status === "BACK_TO_BACK_PREV" && decision.adjacentPreviousEvent) {
      const title = document.createElement("div");
      title.className = "soma-panel-title";
      title.textContent = "직전 일정과 바로 이어집니다";
      panel.appendChild(title);

      const text = document.createElement("div");
      text.className = "soma-panel-text";
      text.textContent = `${decision.adjacentPreviousEvent.title} · 간격 ${decision.gapMinutes || 0}분`;
      panel.appendChild(text);

      if (decision.adjacentPreviousEvent.htmlLink) {
        const openBtn = document.createElement("a");
        openBtn.href = decision.adjacentPreviousEvent.htmlLink;
        openBtn.target = "_blank";
        openBtn.rel = "noopener noreferrer";
        openBtn.textContent = "직전 일정 보기";
        openBtn.className = "soma-link-btn";
        panel.appendChild(openBtn);
      }
    } else if (decision.status === "UNKNOWN") {
      const text = document.createElement("div");
      text.className = "soma-panel-text";
      text.textContent = "이 특강의 시간을 파싱하지 못했습니다. 사이트 구조가 바뀌었을 수 있습니다.";
      panel.appendChild(text);
    }

    return panel;
  }

  function attachDecisionUI(row, lecture, decision, settings, registration, historyRegistrations, onDelete, onCancelLecture) {
    const rel = row.querySelector("td.tit .rel");
    if (!rel) return;

    row.querySelector(`.${EXT.panelRowClass}`)?.remove();
    rel.querySelector(`.${EXT.badgeClass}`)?.remove();

    const badge = createBadge(decision);
    rel.appendChild(badge);

    if (decision.status === "CLEAR") return;

    const panelRow = document.createElement("tr");
    panelRow.className = EXT.panelRowClass;

    const panelCell = document.createElement("td");
    panelCell.colSpan = 9;
    const panel = createPanel(decision, settings, lecture, registration, historyRegistrations, onDelete, onCancelLecture);
    panelCell.appendChild(panel);
    panelRow.appendChild(panelCell);

    row.insertAdjacentElement("afterend", panelRow);
    badge.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
    });
  }

  function renderSummaryBar(host, decisions) {
    host.querySelector(`.${EXT.summaryClass}`)?.remove();

    const overlap = decisions.filter((d) => d.status === "OVERLAP").length;
    const adjacent = decisions.filter((d) => d.status === "BACK_TO_BACK_PREV").length;
    const clear = decisions.filter((d) => d.status === "CLEAR").length;
    const unknown = decisions.filter((d) => d.status === "UNKNOWN").length;

    const bar = document.createElement("div");
    bar.className = EXT.summaryClass;
    bar.textContent = `일정 체크 결과 · 겹침 ${overlap}개 | 바로 이어짐 ${adjacent}개 | 겹치지 않음 ${clear}개${unknown ? ` | 확인 필요 ${unknown}개` : ""}`;
    host.prepend(bar);
  }

  function renderFilterBar(host, rowMap, decisionsByLectureId) {
    host.querySelector(`.${EXT.filterClass}`)?.remove();

    const bar = document.createElement("div");
    bar.className = EXT.filterClass;

    const buttons = [
      { key: "ALL", label: "전체 보기" },
      { key: "OVERLAP", label: "겹침만" },
      { key: "BACK_TO_BACK_PREV", label: "바로 이어짐만" },
      { key: "CLEAR", label: "겹치지 않음만" }
    ];

    function applyFilter(key) {
      for (const [lectureId, row] of rowMap.entries()) {
        const decision = decisionsByLectureId.get(lectureId);
        const panelRow = row.nextElementSibling && row.nextElementSibling.classList.contains(EXT.panelRowClass)
          ? row.nextElementSibling
          : null;

        const visible = key === "ALL" || (decision && decision.status === key);
        row.style.display = visible ? "" : "none";
        if (panelRow) panelRow.style.display = visible ? "" : "none";
      }

      bar.querySelectorAll("button[data-filter-key]").forEach((b) => {
        b.classList.toggle("active", b.dataset.filterKey === key);
      });
    }

    for (const item of buttons) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = item.label;
      btn.dataset.filterKey = item.key;
      btn.addEventListener("click", () => applyFilter(item.key));
      bar.appendChild(btn);
    }

    const rerunBtn = document.createElement("button");
    rerunBtn.type = "button";
    rerunBtn.textContent = "다시 계산";
    rerunBtn.addEventListener("click", () => rerun());
    bar.appendChild(rerunBtn);

    host.prepend(bar);
    applyFilter("ALL");
  }

  function renderNote(host, text) {
    host.querySelector(`.${EXT.noteClass}`)?.remove();
    const note = document.createElement("div");
    note.className = EXT.noteClass;
    note.textContent = text;
    host.prepend(note);
  }

  function getHost() {
    return document.querySelector(".boardlist") || document.querySelector(".bbs-top") || document.body;
  }

  function removeStatusBanner() {
    document.querySelector(`.${EXT.statusBannerClass}`)?.remove();
  }

  function showStatusBanner({ somaLoggedIn, googleConnected, googleMessage = "" }) {
    removeStatusBanner();

    const host = getHost();
    const banner = document.createElement("div");
    banner.className = EXT.statusBannerClass;

    const text = document.createElement("div");
    text.className = "soma-status-banner__text";
    const somaText = somaLoggedIn ? "소마 로그인됨" : "소마 로그인 필요";
    const googleText = googleConnected ? "Google Calendar 연결됨" : "Google Calendar 연결 필요";
    text.textContent = `${somaText} | ${googleText}${googleMessage ? ` (${googleMessage})` : ""}`;
    banner.appendChild(text);

    if (somaLoggedIn && !googleConnected) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Google Calendar 연결";
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "연결 중...";
        try {
          const response = await sendMessage({ type: "AUTH_CONNECT_GOOGLE" });
          if (!response.ok) throw new Error(response.error || "Google 연결 실패");
          await rerun();
        } catch (error) {
          button.disabled = false;
          button.textContent = "Google Calendar 연결";
          window.alert(error instanceof Error ? error.message : String(error));
        }
      });
      banner.appendChild(button);
    }

    host.prepend(banner);
  }

  function showOperationStatus(message) {
    showStatusBanner({
      somaLoggedIn: true,
      googleConnected: true,
      googleMessage: message
    });
  }

  function beginPendingButton(button, pendingText) {
    if (!button) {
      return {
        setText() {},
        restore() {}
      };
    }

    const originalText = button.textContent;
    const originalDisabled = button.disabled;
    button.disabled = true;
    button.textContent = pendingText;

    return {
      setText(nextText) {
        button.textContent = nextText;
      },
      restore() {
        button.disabled = originalDisabled;
        button.textContent = originalText;
      }
    };
  }

  async function loadSettings() {
    const response = await sendMessage({ type: "GET_SETTINGS" });
    if (!response.ok || !response.settings) throw new Error(response.error || "설정을 불러오지 못했습니다.");
    return response.settings;
  }

  async function loadEvents(timeMin, timeMax) {
    const response = await sendMessage({ type: "GET_CALENDAR_EVENTS", payload: { timeMin, timeMax } });
    if (!response.ok || !response.events) throw new Error(response.error || "일정을 불러오지 못했습니다.");
    return response.events;
  }

  async function deleteEvent(calendarId, eventId) {
    const response = await sendMessage({ type: "DELETE_CALENDAR_EVENT", payload: { calendarId, eventId } });
    if (!response.ok) throw new Error(response.error || "일정 삭제에 실패했습니다.");
  }

  async function cancelLectureRegistration(registration) {
    const body = new URLSearchParams({
      id: registration.applySn,
      qustnrSn: registration.qustnrSn,
      gubun: registration.gubun || "mentoLec"
    });

    const response = await fetch("/sw/mypage/userAnswer/cancel.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
      },
      body: body.toString(),
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error(`취소 요청 실패 (${response.status})`);
    }

    return response.json();
  }

  function isSomaLoggedIn() {
    const hasLogoutLink = !!document.querySelector('a[href*="/logout.do"]');
    const hasMyPageLink = !!document.querySelector('a[href*="/mypage/"]');
    return hasLogoutLink || hasMyPageLink;
  }

  async function run() {
    clearInjectedUI();

    const somaLoggedIn = isSomaLoggedIn();
    if (!somaLoggedIn) {
      showStatusBanner({ somaLoggedIn: false, googleConnected: false });
      return;
    }

    const host = getHost();
    renderListQueryBar(host);

    const lectures = parseLecturesFromPage(document);
    if (!lectures.length) {
      renderNote(host, "현재 조회 조건에 해당하는 특강이 없습니다.");
      renderListQueryBar(host);
      return;
    }
    console.log("Parsed lectures:", lectures);
    const settings = await loadSettings();

    const validLectures = lectures.filter((l) => !l.parseFailed && l.startAt && l.endAt);
    let events = [];

    if (validLectures.length > 0) {
      const timeMin = validLectures.map((l) => l.startAt).sort()[0];
      const timeMax = validLectures.map((l) => l.endAt).sort().slice(-1)[0];
      try {
        events = await loadEvents(timeMin, timeMax);
        showStatusBanner({ somaLoggedIn: true, googleConnected: true });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "일정 조회 실패";
        showStatusBanner({ somaLoggedIn: true, googleConnected: false, googleMessage: msg });
        return;
      }
    } else {
      showStatusBanner({ somaLoggedIn: true, googleConnected: true });
    }

    const decisions = [];
    const decisionsByLectureId = new Map();

    for (const lecture of lectures) {
      const decision = classifyLecture(lecture, events, settings.backToBackMinutes);
      decisions.push(decision);
      decisionsByLectureId.set(lecture.id, decision);
    }

    const overlapLectureIds = decisions
      .filter((decision) => decision.status === "OVERLAP")
      .map((decision) => decision.lectureId);
    let historyRegistrations = new Map();

    if (overlapLectureIds.length > 0) {
      try {
        historyRegistrations = await collectHistoryRegistrations();
      } catch (error) {
        console.warn("Failed to load history registrations:", error);
      }
    }

    const rowMap = mapLectureRows(document);
    for (const lecture of lectures) {
      const decision = decisionsByLectureId.get(lecture.id);
      const row = rowMap.get(lecture.id);
      if (!decision || !row) continue;

      const registration = historyRegistrations.get(lecture.id) || null;

      attachDecisionUI(row, lecture, decision, settings, registration, historyRegistrations, async (calendarId, eventId) => {
        try {
          if (settings.confirmBeforeDelete && !window.confirm("이 일정을 삭제하시겠습니까?")) return;
          await deleteEvent(calendarId, eventId);
          await rerun();
        } catch (error) {
          window.alert(error instanceof Error ? error.message : String(error));
        }
      }, async (selectedRegistration, sourceButton) => {
        try {
          if (!selectedRegistration.applySn) {
            window.alert("현재 접수내역 기준으로는 이 특강을 취소할 수 없습니다.");
            return;
          }
          if (!canCancelRegistration(selectedRegistration)) {
            window.alert("특강 시작 24시간 이내에는 취소할 수 없습니다.");
            return;
          }
          const lectureName = selectedRegistration.title || "이 특강";
          if (!window.confirm(`"${lectureName}" 특강을 취소하시겠습니까?`)) return;
          const pendingButton = beginPendingButton(sourceButton, "취소 중...");
          let completed = false;

          try {
            showOperationStatus(`"${lectureName}" 특강 취소 중입니다...`);

            const response = await cancelLectureRegistration(selectedRegistration);
            if (response?.resultCode !== "success") {
              window.alert("특강 취소에 실패했습니다.");
              return;
            }
            if (response.cancelAt !== "Y") {
              window.alert("현재 정책상 이 특강은 취소할 수 없습니다.");
              return;
            }

            pendingButton.setText("동기화 중...");
            showOperationStatus(`"${lectureName}" 취소 후 Google Calendar를 동기화 중입니다...`);

            await syncFromHistorySource();
            completed = true;
            window.alert(`"${lectureName}" 특강을 취소했고, 접수내역 기준으로 Google Calendar도 다시 동기화했습니다.`);
            await rerun();
          } finally {
            pendingButton.restore();
            if (!completed) {
              showStatusBanner({ somaLoggedIn: true, googleConnected: true });
            }
          }
        } catch (error) {
          window.alert(error instanceof Error ? error.message : String(error));
        }
      });
    }

    renderSummaryBar(host, decisions);
    renderFilterBar(host, rowMap, decisionsByLectureId);
    if (settings.allowDirectDelete) {
      renderNote(host, "직접 삭제 기능이 켜져 있습니다. '겹침' 패널에서 일정 삭제가 가능합니다.");
    }
    renderListQueryBar(host);
  }

  async function rerun() {
    try {
      console.log("Running schedule check...");
      await run();
    } catch (error) {
      showStatusBanner({
        somaLoggedIn: isSomaLoggedIn(),
        googleConnected: false,
        googleMessage: error instanceof Error ? error.message : "오류"
      });
    }
  }

  await rerun();
})();
console.log("Content script loaded");
