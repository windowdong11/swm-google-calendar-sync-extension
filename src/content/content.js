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
  const LectureStatus = globalThis.SomaLectureStatus;

  if (!LectureStatus) {
    throw new Error("SomaLectureStatus helper를 찾지 못했습니다.");
  }

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

      lectures.push({
        id,
        title: titleLink.textContent?.trim() || "",
        url: new URL(href, location.origin).toString(),
        startAt: LectureStatus.buildSeoulIsoDateTime(date, timeMatches[0][1], timeMatches[0][2]),
        endAt: LectureStatus.buildSeoulIsoDateTime(date, timeMatches[1][1], timeMatches[1][2]),
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

  async function syncFromHistorySource() {
    const registrations = await LectureStatus.collectHistoryRegistrations();
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

  function clearInjectedUI() {
    document.querySelectorAll(`.${EXT.badgeClass}, .${EXT.panelRowClass}, .${EXT.summaryClass}, .${EXT.filterClass}, .${EXT.queryBarClass}, .${EXT.noteClass}, .${EXT.authBannerClass}, .${EXT.statusBannerClass}`).forEach((el) => el.remove());
    document.querySelectorAll("[data-soma-hidden='1']").forEach((el) => {
      el.style.display = "";
      el.removeAttribute("data-soma-hidden");
    });
  }

  function attachDecisionUI(row, lecture, decision, settings, registration, historyRegistrations, onDelete, onCancelLecture) {
    const rel = row.querySelector("td.tit .rel");
    if (!rel) return;

    row.querySelector(`.${EXT.panelRowClass}`)?.remove();
    rel.querySelector(`.${EXT.badgeClass}`)?.remove();

    const badge = LectureStatus.createBadge(decision, {
      badgeClass: EXT.badgeClass
    });
    rel.appendChild(badge);

    if (decision.status === "CLEAR") return;

    const panelRow = document.createElement("tr");
    panelRow.className = EXT.panelRowClass;

    const panelCell = document.createElement("td");
    panelCell.colSpan = 9;
    const panel = LectureStatus.createPanel(decision, {
      settings,
      lecture,
      registration,
      historyRegistrations,
      onDelete,
      onCancelLecture,
      allowDirectDelete: settings.allowDirectDelete,
      allowConflictCancel: true,
      allowLectureCancel: true,
      showLectureActionRow: true,
      showDetailLink: true,
      initiallyHidden: false
    });
    const panelId = `soma-panel-${lecture.id}`;
    panel.id = panelId;
    panelCell.appendChild(panel);
    panelRow.appendChild(panelCell);
    panelRow.hidden = true;

    row.insertAdjacentElement("afterend", panelRow);
    badge.setAttribute("aria-controls", panelId);
    badge.setAttribute("aria-expanded", "false");
    badge.addEventListener("click", () => {
      panelRow.hidden = !panelRow.hidden;
      badge.setAttribute("aria-expanded", String(!panelRow.hidden));
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

  function shiftIsoValue(value, offsetMs) {
    const normalizedValue = LectureStatus.normalizeCalendarDateTime(value);
    const time = new Date(normalizedValue).getTime();
    if (Number.isNaN(time)) {
      return normalizedValue;
    }

    return new Date(time + offsetMs).toISOString();
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
      const earliestStart = validLectures.map((lecture) => lecture.startAt).sort()[0];
      const timeMax = validLectures.map((l) => l.endAt).sort().slice(-1)[0];
      const timeMin = shiftIsoValue(earliestStart, -(settings.backToBackMinutes || 0) * 60 * 1000);
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
      const decision = LectureStatus.classifyLecture(lecture, events, settings.backToBackMinutes);
      decisions.push(decision);
      decisionsByLectureId.set(lecture.id, decision);
    }

    const overlapLectureIds = decisions
      .filter((decision) => decision.status === "OVERLAP")
      .map((decision) => decision.lectureId);
    let historyRegistrations = new Map();

    if (overlapLectureIds.length > 0) {
      try {
        historyRegistrations = await LectureStatus.collectHistoryRegistrations();
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
          if (!LectureStatus.canCancelRegistration(selectedRegistration)) {
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
