(async function () {
  const EXT = {
    styleId: "soma-history-sync-style",
    bannerClass: "soma-history-sync-banner",
    messageClass: "soma-history-sync-message",
    actionsClass: "soma-history-sync-actions",
    buttonClass: "soma-history-sync-button"
  };

  let syncInFlight = false;

  function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
  }

  function normalizeText(value) {
    return typeof value === "string" ? value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() : "";
  }

  function ensureStyles() {
    if (document.getElementById(EXT.styleId)) return;

    const style = document.createElement("style");
    style.id = EXT.styleId;
    style.textContent = `
      .${EXT.bannerClass} {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
        padding: 12px 14px;
        border-radius: 10px;
        background: #eef4ff;
        font-weight: 600;
      }
      .${EXT.bannerClass}[data-tone="success"] {
        background: #ecf8ef;
      }
      .${EXT.bannerClass}[data-tone="error"] {
        background: #fff1f1;
      }
      .${EXT.messageClass} {
        line-height: 1.45;
      }
      .${EXT.actionsClass} {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .${EXT.buttonClass} {
        border: 0;
        border-radius: 8px;
        padding: 8px 12px;
        cursor: pointer;
        background: #dbe8ff;
        font-weight: 700;
      }
      .${EXT.buttonClass}[data-kind="connect"] {
        background: #d8f1dd;
      }
      .${EXT.buttonClass}:disabled {
        opacity: 0.7;
        cursor: default;
      }
    `;
    document.head.appendChild(style);
  }

  function getHost() {
    return document.querySelector(".boardlist") || document.body;
  }

  function renderBanner({ message, tone = "info", syncing = false, showConnect = false }) {
    ensureStyles();

    const existing = document.querySelector(`.${EXT.bannerClass}`);
    existing?.remove();

    const banner = document.createElement("div");
    banner.className = EXT.bannerClass;
    banner.dataset.tone = tone;

    const text = document.createElement("div");
    text.className = EXT.messageClass;
    text.textContent = message;
    banner.appendChild(text);

    const actions = document.createElement("div");
    actions.className = EXT.actionsClass;

    const syncBtn = document.createElement("button");
    syncBtn.type = "button";
    syncBtn.className = EXT.buttonClass;
    syncBtn.textContent = syncing ? "동기화 중..." : "다시 동기화";
    syncBtn.disabled = syncing;
    syncBtn.addEventListener("click", () => {
      syncHistoryLectures({ forceRefetchAll: true }).catch(() => {});
    });
    actions.appendChild(syncBtn);

    if (showConnect) {
      const connectBtn = document.createElement("button");
      connectBtn.type = "button";
      connectBtn.className = EXT.buttonClass;
      connectBtn.dataset.kind = "connect";
      connectBtn.textContent = "Google 연결";
      connectBtn.disabled = syncing;
      connectBtn.addEventListener("click", async () => {
        try {
          renderBanner({
            message: "Google Calendar 연결 중입니다...",
            syncing: true,
            showConnect: false
          });
          const response = await sendMessage({ type: "AUTH_CONNECT_GOOGLE" });
          if (!response?.ok) {
            throw new Error(response?.error || "Google Calendar 연결에 실패했습니다.");
          }
          await syncHistoryLectures({ forceRefetchAll: true });
        } catch (error) {
          const messageText = error instanceof Error ? error.message : String(error);
          renderBanner({
            message: `Google 연결 실패: ${messageText}`,
            tone: "error",
            showConnect: true
          });
        }
      });
      actions.appendChild(connectBtn);
    }

    banner.appendChild(actions);
    getHost().prepend(banner);
  }

  function parseLectureDateText(raw) {
    const normalized = normalizeText(raw);
    const dateMatch = normalized.match(/(\d{4})-(\d{2})-(\d{2})/);
    const timeMatches = [...normalized.matchAll(/(\d{1,2}):(\d{2}):(\d{2})/g)];

    if (!dateMatch || timeMatches.length < 2) {
      return null;
    }

    const [, year, month, day] = dateMatch;
    const lectureDate = `${year}-${month}-${day}`;
    return {
      lectureDate,
      startAt: `${lectureDate}T${timeMatches[0][1].padStart(2, "0")}:${timeMatches[0][2]}:${timeMatches[0][3]}+09:00`,
      endAt: `${lectureDate}T${timeMatches[1][1].padStart(2, "0")}:${timeMatches[1][2]}:${timeMatches[1][3]}+09:00`
    };
  }

  function parseHistoryRow(row) {
    const cells = Array.from(row.querySelectorAll("td"));
    if (cells.length < 7) return null;

    const statusText = normalizeText(cells[6]?.textContent);
    const historyStateText = normalizeText(cells[8]?.textContent);
    const isActive = statusText.includes("접수완료");
    const isRemoved = historyStateText.includes("삭제");

    if (!isActive && !isRemoved) {
      return null;
    }

    const titleCell = row.querySelector("td.tit");
    const title = normalizeText(titleCell?.textContent);
    const link = titleCell?.querySelector("a");
    const href = link?.getAttribute("href") || "";
    const qustnrSn = href.match(/qustnrSn=(\d+)/)?.[1] || "";
    const detailUrl = href ? new URL(href, location.origin).toString() : "";
    const rawDateText = normalizeText(cells[4]?.textContent || "");
    const schedule = parseLectureDateText(rawDateText);

    if (!title || !schedule || (isActive && !qustnrSn)) {
      const reasons = [];
      if (!title) reasons.push("title");
      if (!qustnrSn && isActive) reasons.push("qustnrSn");
      if (!schedule) reasons.push("schedule");

      return {
        incomplete: true,
        debug: {
          title,
          href,
          qustnrSn,
          rawDateText,
          statusText,
          reasons
        }
      };
    }

    const lecture = {
      qustnrSn: qustnrSn || "",
      title,
      detailUrl,
      lectureDate: schedule.lectureDate,
      startAt: schedule.startAt,
      endAt: schedule.endAt
    };

    if (isRemoved) {
      return {
        inactiveLecture: lecture
      };
    }

    return {
      lecture
    };
  }

  function parseHistoryDocument(doc) {
    const rows = Array.from(doc.querySelectorAll(".boardlist table tbody tr"));
    const lectures = [];
    const inactiveLectures = [];
    let incomplete = false;
    const incompleteRows = [];

    for (const row of rows) {
      const parsed = parseHistoryRow(row);
      if (!parsed) continue;
      if (parsed.incomplete) {
        incomplete = true;
        incompleteRows.push(parsed.debug);
        continue;
      }
      if (parsed.inactiveLecture) {
        inactiveLectures.push(parsed.inactiveLecture);
        continue;
      }
      lectures.push(parsed.lecture);
    }

    return { lectures, inactiveLectures, incomplete, incompleteRows };
  }

  function getLastPage(doc) {
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

  function buildHistoryPageUrl(pageIndex) {
    const url = new URL(location.href);
    url.searchParams.set("pageIndex", String(pageIndex));
    return url.toString();
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

  async function getLectureMappings(qustnrSns) {
    const response = await sendMessage({
      type: "GET_LECTURE_MAPPINGS",
      payload: { qustnrSns }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "로컬 매핑 정보를 불러오지 못했습니다.");
    }

    return response.mappings || {};
  }

  function findGroupValue(doc, label) {
    const groups = Array.from(doc.querySelectorAll(".bbs-view-new .group"));
    for (const group of groups) {
      const title = normalizeText(group.querySelector(".t")?.textContent);
      if (title === label) {
        return normalizeText(group.querySelector(".c")?.textContent);
      }
    }
    return "";
  }

  async function enrichLecturesWithDetails(lectures, mappings) {
    return Promise.all(
      lectures.map(async (lecture) => {
        const mapping = mappings[lecture.qustnrSn] || {};

        if (mapping.place) {
          return {
            ...lecture,
            place: mapping.place,
            detailUrl: lecture.detailUrl || mapping.detailUrl || ""
          };
        }

        if (!lecture.detailUrl) {
          return {
            ...lecture,
            place: "",
            detailUrl: mapping.detailUrl || ""
          };
        }

        try {
          const doc = await fetchHtmlDocument(lecture.detailUrl);
          return {
            ...lecture,
            title: findGroupValue(doc, "모집 명") || lecture.title,
            place: findGroupValue(doc, "장소"),
            detailUrl: lecture.detailUrl
          };
        } catch (_error) {
          return {
            ...lecture,
            place: mapping.place || "",
            detailUrl: lecture.detailUrl || mapping.detailUrl || ""
          };
        }
      })
    );
  }

  async function collectAllActiveLectures({ forceRefetchAll = false } = {}) {
    const currentPage = Number.parseInt(new URL(location.href).searchParams.get("pageIndex") || "1", 10);
    const lastPage = getLastPage(document);
    const lecturesById = new Map();
    const inactiveLecturesByKey = new Map();
    let incomplete = false;
    const incompleteRows = [];

    for (let pageIndex = 1; pageIndex <= lastPage; pageIndex += 1) {
      const doc =
        !forceRefetchAll && pageIndex === currentPage
          ? document
          : await fetchHtmlDocument(buildHistoryPageUrl(pageIndex));

      const parsed = parseHistoryDocument(doc);
      incomplete = incomplete || parsed.incomplete;
      incompleteRows.push(
        ...parsed.incompleteRows.map((item) => ({
          pageIndex,
          ...item
        }))
      );

      for (const lecture of parsed.lectures) {
        lecturesById.set(lecture.qustnrSn, lecture);
      }

      for (const lecture of parsed.inactiveLectures) {
        const key = lecture.qustnrSn || `${lecture.title}@@${lecture.startAt}@@${lecture.endAt}`;
        inactiveLecturesByKey.set(key, lecture);
      }
    }

    return {
      lectures: Array.from(lecturesById.values()),
      inactiveLectures: Array.from(inactiveLecturesByKey.values()),
      sourceComplete: !incomplete,
      incompleteRows
    };
  }

  function buildSyncMessage(stats) {
    const parts = [
      `생성 ${stats.created || 0}건`,
      `업데이트 ${stats.updated || 0}건`,
      `유지 ${stats.unchanged || 0}건`,
      `삭제 ${stats.deleted || 0}건`
    ];

    if (stats.removed) {
      parts.push(`삭제행 처리 ${stats.removed}건`);
    }

    if (stats.pruned) {
      parts.push(`정리 ${stats.pruned}건`);
    }

    return `접수내역 동기화 완료 · ${parts.join(" | ")}`;
  }

  async function syncHistoryLectures({ forceRefetchAll = false } = {}) {
    if (syncInFlight) return null;

    syncInFlight = true;
    renderBanner({
      message: "접수내역을 기준으로 Google Calendar를 동기화하는 중입니다...",
      syncing: true,
      showConnect: false
    });

    try {
      const collected = await collectAllActiveLectures({ forceRefetchAll });
      console.info("SOMA history sync: collected lectures", {
        activeCount: collected.lectures.length,
        inactiveCount: collected.inactiveLectures.length,
        sourceComplete: collected.sourceComplete,
        incompleteCount: collected.incompleteRows.length
      });
      if (collected.incompleteRows.length > 0) {
        console.group("SOMA history sync incomplete rows");
        console.table(collected.incompleteRows);
        console.groupEnd();
      }
      const mappings = await getLectureMappings(collected.lectures.map((lecture) => lecture.qustnrSn));
      const enrichedLectures = await enrichLecturesWithDetails(collected.lectures, mappings);

      const response = await sendMessage({
        type: "SYNC_SOURCE_LECTURES",
        payload: {
          lectures: enrichedLectures,
          inactiveLectures: collected.inactiveLectures,
          sourceComplete: collected.sourceComplete
        }
      });

      console.info("SOMA history sync: background response", response);
      if (Array.isArray(response?.details)) {
        console.group("SOMA history sync details");
        console.table(response.details);
        console.groupEnd();
      }

      if (!response?.ok) {
        throw new Error(response?.error || "Google Calendar 동기화에 실패했습니다.");
      }

      renderBanner({
        message: buildSyncMessage(response.stats || {}),
        tone: "success"
      });

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("SOMA history sync: failed", error);
      renderBanner({
        message: `동기화 실패: ${message}`,
        tone: "error",
        showConnect: true
      });
      throw error;
    } finally {
      syncInFlight = false;
    }
  }

  function canCancelBeforeStart(lecture) {
    const lectureStart = new Date(lecture.startAt);
    if (Number.isNaN(lectureStart.getTime())) {
      return true;
    }

    return lectureStart.getTime() - Date.now() > 24 * 60 * 60 * 1000;
  }

  async function cancelLecture({ id, qustnrSn, gubun }) {
    const body = new URLSearchParams({
      id,
      qustnrSn,
      gubun
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

  function installCancelHandlers() {
    const links = Array.from(document.querySelectorAll('a[href^="javascript:delDate("]'));

    for (const link of links) {
      link.addEventListener(
        "click",
        async (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();

          const href = link.getAttribute("href") || "";
          const match = href.match(/delDate\('([^']+)','([^']+)',\s*'([^']+)'\)/);
          if (!match) {
            window.alert("취소 요청 파라미터를 읽지 못했습니다.");
            return;
          }

          if (!window.confirm("선택된 항목의 접수를 취소 하시겠습니까?")) {
            return;
          }

          const [, id, qustnrSn, gubun] = match;
          const parsed = parseHistoryRow(link.closest("tr"));
          const lecture = parsed?.lecture;

          if (!lecture) {
            window.alert("취소 대상 일정을 읽지 못했습니다.");
            return;
          }

          if (!canCancelBeforeStart(lecture)) {
            window.alert("특강 시작 24시간 이내에는 취소가 불가능합니다.");
            return;
          }

          try {
            const data = await cancelLecture({ id, qustnrSn, gubun });

            if (data?.resultCode === "success") {
              if (data.cancelAt === "Y") {
                try {
                  await syncHistoryLectures({ forceRefetchAll: true });
                  window.alert("취소 하였습니다.\nGoogle Calendar도 접수내역 기준으로 동기화했습니다.");
                } catch (error) {
                  const message = error instanceof Error ? error.message : String(error);
                  window.alert(`취소 하였습니다.\n다만 Google Calendar 동기화는 완료하지 못했습니다.\n${message}`);
                }

                location.reload();
                return;
              }

              window.alert("특강 시작 24시간 이내에는 취소가 불가능합니다.");
              location.reload();
              return;
            }

            window.alert("삭제에 실패하였습니다.");
          } catch (error) {
            window.alert(error instanceof Error ? error.message : String(error));
          }
        },
        true
      );
    }
  }

  renderBanner({
    message: "접수내역 기준 동기화를 준비하고 있습니다..."
  });
  installCancelHandlers();
  await syncHistoryLectures().catch(() => {});
})();
