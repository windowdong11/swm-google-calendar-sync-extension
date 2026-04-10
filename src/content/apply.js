(async function () {
  function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
  }

  function findGroupValue(label) {
    const groups = Array.from(document.querySelectorAll(".bbs-view-new .group"));
    for (const group of groups) {
      const title = group.querySelector(".t")?.textContent?.trim();
      if (title === label) {
        return group.querySelector(".c")?.textContent?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() || "";
      }
    }
    return "";
  }

  function parseLectureDateTime(raw) {
    const normalized = (raw || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
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
      startAt: `${date}T${startHour}:${startMinute}:00+09:00`,
      endAt: `${date}T${endHour}:${endMinute}:00+09:00`
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
})();
