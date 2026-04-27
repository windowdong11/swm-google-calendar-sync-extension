(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.SomaParsers = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
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

  function toAbsoluteUrl(href, origin) {
    const normalizedHref = normalizeText(href);
    if (!normalizedHref) return "";
    return new URL(normalizedHref, origin).toString();
  }

  function findGroup(rootNode, label) {
    return Array.from(rootNode.querySelectorAll(".bbs-view-new .group")).find((group) => {
      const title = normalizeText(group.querySelector(".t")?.textContent || "");
      return title === label;
    }) || null;
  }

  function findGroupValue(rootNode, label) {
    const group = findGroup(rootNode, label);
    return normalizeText(group?.querySelector(".c")?.textContent || "");
  }

  function parseLectureDateTime(raw) {
    const normalized = normalizeText(raw);
    const dateMatch = normalized.match(/(\d{4})[.-](\d{2})[.-](\d{2})/);
    const timeMatches = [...normalized.matchAll(/(\d{1,2}):(\d{2})(?::(\d{2}))?/g)];

    if (!dateMatch || timeMatches.length < 2) {
      throw new Error("강의 날짜에서 시간 정보를 추출하지 못했습니다.");
    }

    const [, year, month, day] = dateMatch;
    const date = `${year}-${month}-${day}`;

    return {
      startAt: buildSeoulIsoDateTime(date, timeMatches[0][1], timeMatches[0][2], timeMatches[0][3] || "00"),
      endAt: buildSeoulIsoDateTime(date, timeMatches[1][1], timeMatches[1][2], timeMatches[1][3] || "00")
    };
  }

  function parseListLectures(doc, { origin } = {}) {
    const rows = Array.from(doc.querySelectorAll(".boardlist table.t tbody tr"));
    const lectures = [];
    const baseOrigin = origin || doc.location?.origin || "https://www.swmaestro.ai";

    for (const row of rows) {
      const titleLink = row.querySelector("td.tit a");
      if (!titleLink) continue;

      const href = titleLink.getAttribute("href") || "";
      const idMatch = href.match(/qustnrSn=(\d+)/);
      const id = idMatch?.[1];
      if (!id) continue;

      const tds = Array.from(row.querySelectorAll("td.pc_only"));
      if (tds.length < 8) continue;

      const rawText = normalizeText(tds[2]?.textContent || "");
      const statusText = normalizeText(tds[4]?.textContent || "");

      try {
        const { startAt, endAt } = parseLectureDateTime(rawText);
        lectures.push({
          id,
          title: normalizeText(titleLink.textContent || ""),
          url: toAbsoluteUrl(href, baseOrigin),
          startAt,
          endAt,
          parseFailed: false,
          statusText: statusText || "접수중",
          rawText
        });
      } catch (_error) {
        lectures.push({
          id,
          title: normalizeText(titleLink.textContent || ""),
          url: toAbsoluteUrl(href, baseOrigin),
          startAt: "",
          endAt: "",
          parseFailed: true,
          statusText: statusText || "접수중",
          rawText
        });
      }
    }

    return lectures;
  }

  function parseDetailStatusInfo(doc, { href } = {}) {
    const qustnrSn = normalizeText(doc.querySelector('input[name="qustnrSn"]')?.value || "");
    const title = findGroupValue(doc, "모집 명");
    const place = findGroupValue(doc, "장소");
    const lectureDate = findGroupValue(doc, "강의날짜");
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
      detailUrl: href || "",
      url: href || ""
    };
  }

  function parseDetailLectureInfo(doc, { href } = {}) {
    const qustnrSn = normalizeText(doc.querySelector('input[name="qustnrSn"]')?.value || "");
    const title = findGroupValue(doc, "모집 명");
    const place = findGroupValue(doc, "장소");
    const lectureDate = findGroupValue(doc, "강의날짜");
    const capacityText = findGroupValue(doc, "모집인원");
    const appliedCount = Array.from(doc.querySelectorAll(".boardlist tbody tr"))
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
      detailUrl: href || ""
    };
  }

  function parseHistoryDateText(rawText) {
    const normalized = normalizeText(rawText);
    const dateMatch = normalized.match(/(\d{4})-(\d{2})-(\d{2})/);
    const timeMatches = [...normalized.matchAll(/(\d{1,2}):(\d{2}):(\d{2})/g)];

    if (!dateMatch || timeMatches.length < 2) {
      return null;
    }

    const [, year, month, day] = dateMatch;
    const lectureDate = `${year}-${month}-${day}`;
    return {
      lectureDate,
      startAt: buildSeoulIsoDateTime(lectureDate, timeMatches[0][1], timeMatches[0][2], timeMatches[0][3]),
      endAt: buildSeoulIsoDateTime(lectureDate, timeMatches[1][1], timeMatches[1][2], timeMatches[1][3])
    };
  }

  function parseHistoryRow(row, { origin } = {}) {
    const cells = Array.from(row.querySelectorAll("td"));
    if (cells.length < 9) return null;

    const baseOrigin = origin || row.ownerDocument?.location?.origin || "https://www.swmaestro.ai";
    const statusText = normalizeText(cells[6]?.textContent || "");
    const historyStateText = normalizeText(cells[8]?.textContent || "");
    const isActive = statusText.includes("접수완료");
    const isRemoved = historyStateText.includes("삭제");

    if (!isActive && !isRemoved) {
      return null;
    }

    const titleCell = row.querySelector("td.tit");
    const title = normalizeText(titleCell?.textContent || "");
    const link = titleCell?.querySelector("a");
    const href = link?.getAttribute("href") || "";
    const qustnrSn = href.match(/qustnrSn=(\d+)/)?.[1] || "";
    const detailUrl = href ? toAbsoluteUrl(href, baseOrigin) : "";
    const rawDateText = normalizeText(cells[4]?.textContent || "");
    const schedule = parseHistoryDateText(rawDateText);

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

    return { lecture };
  }

  function parseHistoryDocument(doc, { origin } = {}) {
    const rows = Array.from(doc.querySelectorAll(".boardlist table tbody tr"));
    const lectures = [];
    const inactiveLectures = [];
    let incomplete = false;
    const incompleteRows = [];

    for (const row of rows) {
      const parsed = parseHistoryRow(row, { origin });
      if (!parsed) continue;
      if (parsed.incomplete) {
        incomplete = true;
        incompleteRows.push(parsed.debug);
        continue;
      }
      if (parsed.lecture) {
        lectures.push(parsed.lecture);
      }
      if (parsed.inactiveLecture) {
        inactiveLectures.push(parsed.inactiveLecture);
      }
    }

    return { lectures, inactiveLectures, incomplete, incompleteRows };
  }

  function parseHistoryRegistrationRow(row, { origin } = {}) {
    const cells = Array.from(row.querySelectorAll("td"));
    if (cells.length < 9) return null;

    const statusText = normalizeText(cells[6]?.textContent || "");
    if (!statusText.includes("접수완료")) {
      return null;
    }

    const baseOrigin = origin || row.ownerDocument?.location?.origin || "https://www.swmaestro.ai";
    const titleCell = row.querySelector("td.tit");
    const title = normalizeText(titleCell?.textContent || "");
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
      detailUrl: href ? toAbsoluteUrl(href, baseOrigin) : "",
      startAt: schedule.startAt,
      endAt: schedule.endAt,
      applySn: cancelMatch?.[1] || "",
      gubun: cancelMatch?.[3] || "mentoLec"
    };
  }

  function parseHistoryRegistrations(doc, { origin } = {}) {
    return Array.from(doc.querySelectorAll(".boardlist table tbody tr"))
      .map((row) => parseHistoryRegistrationRow(row, { origin }))
      .filter(Boolean);
  }

  return {
    buildSeoulIsoDateTime,
    findGroup,
    findGroupValue,
    normalizeText,
    parseDetailLectureInfo,
    parseDetailStatusInfo,
    parseHistoryDateText,
    parseHistoryDocument,
    parseHistoryRegistrationRow,
    parseHistoryRegistrations,
    parseHistoryRow,
    parseLectureDateTime,
    parseListLectures
  };
});
