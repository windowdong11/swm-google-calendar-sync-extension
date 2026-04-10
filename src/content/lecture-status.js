(function () {
  function normalizeText(value) {
    return typeof value === "string" ? value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() : "";
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

  function buildSeoulIsoDateTime(dateString, hourText, minuteText, secondText = "00") {
    const normalizedHour = padTwo(hourText);
    const normalizedMinute = padTwo(minuteText);
    const normalizedSecond = padTwo(secondText);

    if (normalizedHour === "24" && normalizedMinute === "00" && normalizedSecond === "00") {
      return `${addDaysToDateString(dateString, 1)}T00:00:00+09:00`;
    }

    return `${dateString}T${normalizedHour}:${normalizedMinute}:${normalizedSecond}+09:00`;
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

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function shouldIgnoreEvent(event, options = {}) {
    if (!event) return true;

    const ignoredEventIds = options.ignoredEventIds instanceof Set
      ? options.ignoredEventIds
      : new Set(options.ignoredEventIds || []);
    const ignoredLectureIds = options.ignoredLectureIds instanceof Set
      ? options.ignoredLectureIds
      : new Set(options.ignoredLectureIds || []);

    if (event.id && ignoredEventIds.has(event.id)) {
      return true;
    }

    if (event.somaQustnrSn && ignoredLectureIds.has(event.somaQustnrSn)) {
      return true;
    }

    return false;
  }

  function classifyLecture(lecture, events, backToBackMinutes, options = {}) {
    if (lecture.parseFailed || !lecture.startAt || !lecture.endAt) {
      return {
        lectureId: lecture.id || lecture.qustnrSn || "",
        status: "UNKNOWN",
        conflictingEvents: []
      };
    }

    const lectureStart = new Date(lecture.startAt).getTime();
    const lectureEnd = new Date(lecture.endAt).getTime();
    const filteredEvents = (events || []).filter((event) => !shouldIgnoreEvent(event, options));

    const conflictingEvents = filteredEvents.filter((event) => {
      const eventStart = new Date(event.startAt).getTime();
      const eventEnd = new Date(event.endAt).getTime();
      return lectureStart < eventEnd && eventStart < lectureEnd;
    });

    if (conflictingEvents.length > 0) {
      return {
        lectureId: lecture.id || lecture.qustnrSn || "",
        status: "OVERLAP",
        conflictingEvents
      };
    }

    const thresholdMs = backToBackMinutes * 60 * 1000;
    let adjacentPreviousEvent;
    let bestGap = Number.POSITIVE_INFINITY;

    for (const event of filteredEvents) {
      const eventEnd = new Date(event.endAt).getTime();
      const gap = lectureStart - eventEnd;
      if (gap >= 0 && gap <= thresholdMs && gap < bestGap) {
        bestGap = gap;
        adjacentPreviousEvent = event;
      }
    }

    if (adjacentPreviousEvent) {
      return {
        lectureId: lecture.id || lecture.qustnrSn || "",
        status: "BACK_TO_BACK_PREV",
        conflictingEvents: [],
        adjacentPreviousEvent,
        gapMinutes: Math.round(bestGap / 60000)
      };
    }

    return {
      lectureId: lecture.id || lecture.qustnrSn || "",
      status: "CLEAR",
      conflictingEvents: []
    };
  }

  function createBadge(decision, options = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = options.badgeClass || "soma-badge";

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

  function canCancelRegistration(registration) {
    const startTime = new Date(registration?.startAt || "");
    if (Number.isNaN(startTime.getTime())) {
      return true;
    }

    return startTime.getTime() - Date.now() > 24 * 60 * 60 * 1000;
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

  function appendCalendarLink(actions, href, label) {
    if (!href) return;

    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    link.className = "soma-link-btn";
    actions.appendChild(link);
  }

  function createPanel(decision, options = {}) {
    const {
      settings = {},
      lecture = {},
      registration = null,
      historyRegistrations = new Map(),
      currentLectureId = lecture.id || lecture.qustnrSn || "",
      onDelete,
      onCancelLecture,
      allowDirectDelete = Boolean(settings.allowDirectDelete),
      allowConflictCancel = true,
      allowLectureCancel = true,
      showLectureActionRow = true,
      showDetailLink = true,
      initiallyHidden = true,
      panelClassName = ""
    } = options;

    const panel = document.createElement("div");
    panel.className = ["soma-panel", panelClassName].filter(Boolean).join(" ");
    panel.hidden = initiallyHidden;

    if (decision.status === "OVERLAP") {
      const title = document.createElement("div");
      title.className = "soma-panel-title";
      title.textContent = `겹치는 일정 ${decision.conflictingEvents.length}개`;
      panel.appendChild(title);

      for (const event of decision.conflictingEvents) {
        const item = document.createElement("div");
        item.className = "soma-panel-item";
        const overlapRegistration = findOverlapLectureRegistration(event, currentLectureId, historyRegistrations);

        const text = document.createElement("div");
        text.className = "soma-panel-text";
        text.textContent = buildConflictEventText(event, overlapRegistration);

        const actions = document.createElement("div");
        actions.className = "soma-panel-actions";

        appendCalendarLink(actions, event.htmlLink, "캘린더에서 열기");

        if (allowDirectDelete && typeof onDelete === "function") {
          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "soma-danger-btn";
          delBtn.textContent = "삭제";
          delBtn.addEventListener("click", () => onDelete(event.calendarId, event.id));
          actions.appendChild(delBtn);
        }

        if (allowConflictCancel && overlapRegistration && typeof onCancelLecture === "function") {
          const cancelBtn = document.createElement("button");
          cancelBtn.type = "button";
          cancelBtn.className = "soma-danger-btn";
          cancelBtn.textContent = "겹친 특강 취소";
          cancelBtn.disabled = !overlapRegistration.applySn || !canCancelRegistration(overlapRegistration);
          cancelBtn.addEventListener("click", () => onCancelLecture(overlapRegistration, cancelBtn));
          actions.appendChild(cancelBtn);
        }

        item.appendChild(text);
        if (actions.childElementCount > 0) {
          item.appendChild(actions);
        }
        panel.appendChild(item);
      }

      if (showLectureActionRow) {
        const lectureActionRow = document.createElement("div");
        lectureActionRow.className = "soma-panel-item";

        const lectureActionText = document.createElement("div");
        lectureActionText.className = "soma-panel-text";

        const lectureActionActions = document.createElement("div");
        lectureActionActions.className = "soma-panel-actions";

        if (showDetailLink) {
          appendCalendarLink(lectureActionActions, lecture.url || lecture.detailUrl || "", "특강 상세 보기");
        }

        if (allowLectureCancel && registration && typeof onCancelLecture === "function") {
          const cancelBtn = document.createElement("button");
          cancelBtn.type = "button";
          cancelBtn.className = "soma-danger-btn";
          cancelBtn.textContent = "이 특강 취소";
          cancelBtn.disabled = !registration.applySn || !canCancelRegistration(registration);
          cancelBtn.addEventListener("click", () => onCancelLecture(registration, cancelBtn));
          lectureActionActions.appendChild(cancelBtn);
        }

        if (registration) {
          lectureActionText.textContent = registration.applySn
            ? canCancelRegistration(registration)
              ? "이미 신청한 특강입니다. 특강 취소 후 접수내역 기준으로 다시 동기화할 수 있습니다."
              : "특강 시작 24시간 이내라서 여기서는 취소할 수 없습니다."
            : "현재 접수내역 기준으로는 이 특강을 바로 취소할 수 없습니다.";
        } else if (showDetailLink || allowLectureCancel) {
          lectureActionText.textContent = "접수내역에 없는 특강이라서 여기서 바로 취소할 수 없습니다.";
        }

        if (lectureActionText.textContent || lectureActionActions.childElementCount > 0) {
          lectureActionRow.appendChild(lectureActionText);
          if (lectureActionActions.childElementCount > 0) {
            lectureActionRow.appendChild(lectureActionActions);
          }
          panel.appendChild(lectureActionRow);
        }
      }
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
        const actions = document.createElement("div");
        actions.className = "soma-panel-actions";
        appendCalendarLink(actions, decision.adjacentPreviousEvent.htmlLink, "직전 일정 보기");
        panel.appendChild(actions);
      }
    } else if (decision.status === "UNKNOWN") {
      const text = document.createElement("div");
      text.className = "soma-panel-text";
      text.textContent = "이 특강의 시간을 파싱하지 못했습니다. 사이트 구조가 바뀌었을 수 있습니다.";
      panel.appendChild(text);
    }

    return panel;
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
      startAt: buildSeoulIsoDateTime(date, timeMatches[0][1], timeMatches[0][2], timeMatches[0][3]),
      endAt: buildSeoulIsoDateTime(date, timeMatches[1][1], timeMatches[1][2], timeMatches[1][3])
    };
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

  globalThis.SomaLectureStatus = {
    buildSeoulIsoDateTime,
    buildConflictEventText,
    canCancelRegistration,
    classifyLecture,
    collectHistoryRegistrations,
    createBadge,
    createPanel,
    findOverlapLectureRegistration,
    formatDateTime,
    normalizeCalendarDateTime,
    normalizeText
  };
})();
