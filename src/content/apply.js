(async function () {
  const EXT = {
    badgeClass: "soma-badge",
    detailMarkerAttr: "data-soma-detail-status",
    detailPanelClass: "soma-panel--detail",
    detailStatusNoteClass: "soma-detail-status-note"
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

  function findGroup(label) {
    return Array.from(document.querySelectorAll(".bbs-view-new .group")).find((group) => {
      const title = group.querySelector(".t")?.textContent?.trim();
      return title === label;
    }) || null;
  }

  function findGroupValue(label) {
    const group = findGroup(label);
    return normalizeText(group?.querySelector(".c")?.textContent || "");
  }

  function parseLectureDateTime(raw) {
    const normalized = normalizeText(raw);
    const dateMatch = normalized.match(/(\d{4})\.(\d{2})\.(\d{2})/);
    const timeMatches = [...normalized.matchAll(/(\d{1,2}):(\d{2})/g)];

    if (!dateMatch || timeMatches.length < 2) {
      throw new Error("강의 날짜에서 시간 정보를 추출하지 못했습니다.");
    }

    const [, year, month, day] = dateMatch;
    const startHour = timeMatches[0][1].padStart(2, "0");
    const startMinute = timeMatches[0][2];
    const endHour = timeMatches[1][1].padStart(2, "0");
    const endMinute = timeMatches[1][2];
    const date = `${year}-${month}-${day}`;

    return {
      startAt: LectureStatus.buildSeoulIsoDateTime(date, startHour, startMinute),
      endAt: LectureStatus.buildSeoulIsoDateTime(date, endHour, endMinute)
    };
  }

  function extractLectureStatusInfo() {
    const qustnrSn = document.querySelector('input[name="qustnrSn"]')?.value?.trim() || "";
    const title = findGroupValue("모집 명");
    const place = findGroupValue("장소");
    const lectureDate = findGroupValue("강의날짜");
    let schedule = null;

    try {
      schedule = parseLectureDateTime(lectureDate);
    } catch (_error) {
      schedule = null;
    }

    if (!qustnrSn || !title) {
      return null;
    }

    return {
      id: qustnrSn,
      qustnrSn,
      title,
      place,
      startAt: schedule?.startAt || "",
      endAt: schedule?.endAt || "",
      parseFailed: !schedule,
      detailUrl: location.href,
      url: location.href
    };
  }

  function extractLectureInfo() {
    const qustnrSn = document.querySelector('input[name="qustnrSn"]')?.value?.trim() || "";
    const title = findGroupValue("모집 명");
    const place = findGroupValue("장소");
    const lectureDate = findGroupValue("강의날짜");
    const capacityText = findGroupValue("모집인원");
    const appliedCount = Array.from(document.querySelectorAll(".boardlist tbody tr"))
      .filter((row) => row.textContent?.includes("[신청완료]"))
      .length;

    if (!qustnrSn) throw new Error("특강 식별자(qustnrSn)를 찾지 못했습니다.");
    if (!title) throw new Error("모집 명을 찾지 못했습니다.");
    if (!place) throw new Error("장소를 찾지 못했습니다.");

    const { startAt, endAt } = parseLectureDateTime(lectureDate);
    const applyCnt = Number.parseInt(capacityText.replace(/[^\d]/g, ""), 10);

    if (!Number.isFinite(applyCnt)) {
      throw new Error("모집인원을 읽지 못했습니다.");
    }

    return {
      qustnrSn,
      applyCnt,
      appCnt: appliedCount,
      title,
      place,
      startAt,
      endAt,
      detailUrl: location.href
    };
  }

  function markDetailElement(element) {
    element.setAttribute(EXT.detailMarkerAttr, "1");
    return element;
  }

  function clearDetailStatusUI() {
    document.querySelectorAll(`[${EXT.detailMarkerAttr}="1"]`).forEach((element) => element.remove());
  }

  function getDetailStatusHost() {
    const group = findGroup("모집 명");
    if (!group) return null;

    const value = group.querySelector(".c");
    if (!value) return null;

    return { group, value };
  }

  function renderStatusNote(message) {
    const host = getDetailStatusHost();
    if (!host) return;

    const note = markDetailElement(document.createElement("div"));
    note.className = `soma-note ${EXT.detailStatusNoteClass}`;
    note.textContent = message;
    host.group.appendChild(note);
  }

  function buildDetailLoadFailureMessage(error) {
    const message = error instanceof Error ? error.message : String(error || "");

    if (!message) {
      return "지금은 Google Calendar 일정을 불러오지 못해 겹침 여부를 계산하지 못했습니다.";
    }

    if (message.includes("연결") || message.includes("OAuth") || message.includes("인증")) {
      return `Google Calendar를 연결하면 겹침 여부를 확인할 수 있습니다. (${message})`;
    }

    return `지금은 Google Calendar 일정을 불러오지 못해 겹침 여부를 계산하지 못했습니다. (${message})`;
  }

  function buildSettingsFailureMessage(error) {
    const message = error instanceof Error ? error.message : String(error || "");
    return message
      ? `설정을 불러오지 못해 겹침 여부를 계산하지 못했습니다. (${message})`
      : "설정을 불러오지 못해 겹침 여부를 계산하지 못했습니다.";
  }

  async function loadSettings() {
    const response = await sendMessage({ type: "GET_SETTINGS" });
    if (!response?.ok || !response.settings) {
      throw new Error(response?.error || "설정을 불러오지 못했습니다.");
    }
    return response.settings;
  }

  async function loadEvents(timeMin, timeMax) {
    const response = await sendMessage({ type: "GET_CALENDAR_EVENTS", payload: { timeMin, timeMax } });
    if (!response?.ok || !response.events) {
      throw new Error(response?.error || "일정을 불러오지 못했습니다.");
    }
    return response.events;
  }

  async function loadLectureMappings(qustnrSns) {
    const response = await sendMessage({
      type: "GET_LECTURE_MAPPINGS",
      payload: { qustnrSns }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "특강 매핑을 불러오지 못했습니다.");
    }

    return response.mappings || {};
  }

  function shiftIsoValue(value, offsetMs) {
    const normalizedValue = LectureStatus.normalizeCalendarDateTime(value);
    const time = new Date(normalizedValue).getTime();
    if (Number.isNaN(time)) {
      return normalizedValue;
    }

    return new Date(time + offsetMs).toISOString();
  }

  function buildIgnoredEventOptions(lecture, mappings) {
    const ignoredEventIds = [];
    const mapping = mappings?.[lecture.qustnrSn];

    if (mapping?.eventId) {
      ignoredEventIds.push(mapping.eventId);
    }

    return {
      ignoredEventIds,
      ignoredLectureIds: lecture.qustnrSn ? [lecture.qustnrSn] : []
    };
  }

  function renderDecisionBadge(decision, lecture, settings, historyRegistrations) {
    const host = getDetailStatusHost();
    if (!host) return;

    const badge = markDetailElement(LectureStatus.createBadge(decision, {
      badgeClass: EXT.badgeClass
    }));
    host.value.appendChild(badge);

    if (decision.status === "CLEAR") {
      return;
    }

    const panel = markDetailElement(LectureStatus.createPanel(decision, {
      settings,
      lecture,
      historyRegistrations,
      currentLectureId: lecture.qustnrSn,
      allowDirectDelete: false,
      allowConflictCancel: false,
      allowLectureCancel: false,
      showLectureActionRow: false,
      showDetailLink: false,
      panelClassName: EXT.detailPanelClass
    }));

    host.group.appendChild(panel);
    badge.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
    });
  }

  async function renderLectureStatus() {
    clearDetailStatusUI();

    const lecture = extractLectureStatusInfo();
    if (!lecture) {
      return;
    }

    if (lecture.parseFailed) {
      const decision = LectureStatus.classifyLecture(lecture, [], 0);
      renderDecisionBadge(decision, lecture, { allowDirectDelete: false }, new Map());
      return;
    }

    let settings;
    try {
      settings = await loadSettings();
    } catch (error) {
      renderStatusNote(buildSettingsFailureMessage(error));
      return;
    }
    let mappings = {};

    try {
      mappings = await loadLectureMappings([lecture.qustnrSn]);
    } catch (error) {
      console.warn("Failed to load lecture mappings:", error);
    }

    let events;
    try {
      const timeMin = shiftIsoValue(lecture.startAt, -(settings.backToBackMinutes || 0) * 60 * 1000);
      events = await loadEvents(timeMin, lecture.endAt);
    } catch (error) {
      renderStatusNote(buildDetailLoadFailureMessage(error));
      return;
    }

    const decision = LectureStatus.classifyLecture(
      lecture,
      events,
      settings.backToBackMinutes,
      buildIgnoredEventOptions(lecture, mappings)
    );

    let historyRegistrations = new Map();
    if (decision.status === "OVERLAP") {
      try {
        historyRegistrations = await LectureStatus.collectHistoryRegistrations();
      } catch (error) {
        console.warn("Failed to load history registrations:", error);
      }
    }

    renderDecisionBadge(decision, lecture, settings, historyRegistrations);
  }

  async function ensureGoogleConnected() {
    const response = await sendMessage({ type: "AUTH_CONNECT_GOOGLE" });
    if (!response?.ok) {
      throw new Error(response?.error || "Google Calendar 연결에 실패했습니다.");
    }
  }

  async function applyLecture(lecture) {
    const body = new URLSearchParams({
      qustnrSn: lecture.qustnrSn,
      applyCnt: String(lecture.applyCnt),
      appCnt: String(lecture.appCnt)
    });

    const response = await fetch("/sw/mypage/mentoLec/apply.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
      },
      body: body.toString(),
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error(`신청 요청 실패 (${response.status})`);
    }

    return response.json();
  }

  async function syncLecture(lecture) {
    const response = await sendMessage({
      type: "UPSERT_SOURCE_LECTURE",
      payload: {
        qustnrSn: lecture.qustnrSn,
        title: lecture.title,
        place: lecture.place,
        startAt: lecture.startAt,
        endAt: lecture.endAt,
        detailUrl: lecture.detailUrl
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Google Calendar 동기화에 실패했습니다.");
    }

    return response;
  }

  function canCancelBeforeStart(lecture) {
    const eventStart = new Date(lecture.startAt);
    if (Number.isNaN(eventStart.getTime())) {
      return true;
    }

    return eventStart.getTime() - Date.now() > 24 * 60 * 60 * 1000;
  }

  async function cancelLecture({ qustnrSn, applySn }) {
    const body = new URLSearchParams({
      id: applySn,
      qustnrSn
    });

    const response = await fetch("/sw/mypage/mentoLec/applyCancel.json", {
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

  async function removeLectureFromCalendar(lecture) {
    const response = await sendMessage({
      type: "DELETE_CALENDAR_EVENT_BY_LECTURE",
      payload: {
        qustnrSn: lecture.qustnrSn,
        title: lecture.title,
        place: lecture.place,
        startAt: lecture.startAt,
        endAt: lecture.endAt,
        detailUrl: lecture.detailUrl
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Google Calendar 일정 삭제에 실패했습니다.");
    }

    return response;
  }

  async function handleApply() {
    const lecture = extractLectureInfo();

    if (!window.confirm("신청 하시겠습니까?")) {
      return;
    }

    let data;
    try {
      data = await applyLecture(lecture);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
      return;
    }

    const shouldSync = data?.resultCode === "success" || data?.resultCode === "error";
    let syncMessage = "";

    if (shouldSync) {
      syncMessage = "접수내역 페이지에서 다시 동기화해 주세요.";

      try {
        await ensureGoogleConnected();
        const syncResult = await syncLecture(lecture);
        syncMessage =
          syncResult.status === "created"
            ? "Google Calendar에 일정을 추가했습니다."
            : syncResult.status === "updated"
              ? "Google Calendar 일정을 최신 정보로 갱신했습니다."
              : "Google Calendar 일정이 이미 최신 상태였습니다.";
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        syncMessage = `다만 Google Calendar 동기화는 지금 완료하지 못했습니다.\n${message}\n접수내역 페이지에서 다시 동기화할 수 있습니다.`;
      }
    }

    if (data?.resultCode === "success") {
      window.alert(`${data.msg}\n${syncMessage}`);
      location.reload();
      return;
    }

    if (data?.resultCode === "error") {
      window.alert(`이미 신청 하였습니다.\n${syncMessage}`);
      return;
    }

    window.alert("신청 실패하였습니다.");
  }

  async function handleCancel(qustnrSn, applySn) {
    const lecture = extractLectureInfo();

    if (lecture.qustnrSn !== qustnrSn) {
      lecture.qustnrSn = qustnrSn;
    }

    if (!window.confirm("접수를 취소 하시겠습니까?")) {
      return;
    }

    if (!canCancelBeforeStart(lecture)) {
      window.alert("특강 시작 24시간 이내에는 접수 취소가 불가능합니다.");
      return;
    }

    let data;
    try {
      data = await cancelLecture({ qustnrSn, applySn });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
      return;
    }

    if (data?.resultCode === "success") {
      if (data.cancelAt === "Y") {
        let syncMessage = "Google Calendar 일정도 삭제했습니다.";
        try {
          await ensureGoogleConnected();
          const result = await removeLectureFromCalendar(lecture);
          if (!result.deletedCount) {
            syncMessage = "Google Calendar에서는 삭제할 일정을 찾지 못했지만, 현재 상태는 정리되었습니다.";
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          syncMessage = `다만 Google Calendar 동기화는 지금 완료하지 못했습니다.\n${message}`;
        }

        window.alert(`취소 하였습니다.\n${syncMessage}`);
        location.reload();
        return;
      }

      window.alert("특강 시작 24시간 이내에는 취소가 불가능합니다.");
      location.reload();
      return;
    }

    window.alert("작업에 실패하였습니다.");
  }

  function installApplyHandler() {
    const button = document.getElementById("applyLec");
    if (!button) return;

    button.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = "신청 중...";

        try {
          await handleApply();
        } catch (error) {
          window.alert(error instanceof Error ? error.message : String(error));
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      },
      true
    );
  }

  function installCancelHandler() {
    const button = Array.from(document.querySelectorAll("button")).find((element) => {
      const onclick = element.getAttribute("onclick") || "";
      return onclick.includes("applyCancel(");
    });

    if (!button) return;

    button.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const onclick = button.getAttribute("onclick") || "";
        const match = onclick.match(/applyCancel\('([^']+)','([^']+)'\)/);
        if (!match) {
          window.alert("취소 요청 파라미터를 읽지 못했습니다.");
          return;
        }

        const [, qustnrSn, applySn] = match;
        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = "취소 중...";

        try {
          await handleCancel(qustnrSn, applySn);
        } catch (error) {
          window.alert(error instanceof Error ? error.message : String(error));
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      },
      true
    );
  }

  installApplyHandler();
  installCancelHandler();

  try {
    await renderLectureStatus();
  } catch (error) {
    console.warn("Failed to render lecture status:", error);
    renderStatusNote(buildDetailLoadFailureMessage(error));
  }
})();
