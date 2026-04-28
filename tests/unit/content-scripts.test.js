const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.resolve(__dirname, "../..");
const ROOT_ORIGIN = "https://swmaestro.ai";
const WWW_ORIGIN = "https://www.swmaestro.ai";

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8"
    }
  });
}

function createDom(html, url) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => {
    if (!String(error.message || "").includes("Not implemented: navigation")) {
      throw error;
    }
  });

  return new JSDOM(html, {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole
  });
}

function installCommonWindowMocks(window) {
  window.alert = () => {};
  window.confirm = () => true;
  window.console = {
    error() {},
    group() {},
    groupEnd() {},
    info() {},
    log() {},
    table() {},
    warn() {}
  };
}

function runBrowserScript(window, relativePath) {
  window.eval(`${readSource(relativePath)}\n//# sourceURL=${relativePath}`);
}

async function waitFor(assertion, timeoutMs = 1000) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = assertion();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  if (lastError) throw lastError;
  throw new Error("Timed out waiting for condition");
}

function listRow({ id, title, dateText, statusText }) {
  return `
    <tr data-id="${id}">
      <td class="tit">
        <div class="rel">
          <a href="/sw/mypage/mentoLec/view.do?qustnrSn=${id}">${title}</a>
        </div>
      </td>
      <td class="pc_only">멘토</td>
      <td class="pc_only">분야</td>
      <td class="pc_only">${dateText}</td>
      <td class="pc_only">온라인</td>
      <td class="pc_only">${statusText}</td>
      <td class="pc_only">30</td>
      <td class="pc_only">온라인</td>
      <td class="pc_only">비고</td>
    </tr>
  `;
}

function createListDom() {
  return createDom(`
    <!doctype html>
    <html>
      <body>
        <a href="/sw/member/user/logout.do">로그아웃</a>
        <div class="bbs-top">
          <form id="status-filter" action="/sw/mypage/mentoLec/list.do">
            <input type="hidden" name="searchStatMentolec" value="A">
            <input type="hidden" name="pageQueryString" value="pageIndex=2">
            <button type="button">접수중</button>
          </form>
        </div>
        <div class="boardlist">
          <table class="t">
            <tbody>
              ${listRow({
                id: "61001",
                title: "[예시] 겹치는 특강",
                dateText: "2026-05-10(일) 10:00 ~ 12:00",
                statusText: "접수중"
              })}
              ${listRow({
                id: "61002",
                title: "[예시] 겹치지 않는 특강",
                dateText: "2026-05-10(일) 14:00 ~ 16:00",
                statusText: "마감"
              })}
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `, `${ROOT_ORIGIN}/sw/mypage/mentoLec/list.do?pageIndex=2&menuNo=200046&searchStatMentolec=A`);
}

function loadContentList(dom, events) {
  const messages = [];
  const fetchCalls = [];

  dom.window.chrome = {
    runtime: {
      async sendMessage(message) {
        messages.push(message);

        if (message.type === "GET_SETTINGS") {
          return {
            ok: true,
            settings: {
              backToBackMinutes: 15,
              allowDirectDelete: false,
              confirmBeforeDelete: true,
              includeTransparentEvents: false,
              selectedCalendarIds: ["primary"]
            }
          };
        }

        if (message.type === "GET_CALENDAR_EVENTS") {
          return { ok: true, events };
        }

        if (message.type === "GET_LECTURE_MAPPINGS") {
          return { ok: true, mappings: {} };
        }

        if (message.type === "SYNC_SOURCE_LECTURES") {
          return { ok: true, stats: {} };
        }

        throw new Error(`Unexpected message: ${message.type}`);
      }
    }
  };

  dom.window.fetch = async (input) => {
    fetchCalls.push(String(input));
    return htmlResponse('<div class="boardlist"><table><tbody></tbody></table></div>');
  };

  installCommonWindowMocks(dom.window);
  runBrowserScript(dom.window, "src/content/parsers.js");
  runBrowserScript(dom.window, "src/content/lecture-status.js");
  runBrowserScript(dom.window, "src/content/content.js");

  return { messages, fetchCalls };
}

function loadDetailDom(relativeFixture, url) {
  return createDom(fs.readFileSync(path.join(ROOT, relativeFixture), "utf8"), url);
}

function loadApplyScript(dom, { fetchResponse, events = [] } = {}) {
  const messages = [];
  const fetchCalls = [];

  dom.window.chrome = {
    runtime: {
      async sendMessage(message) {
        messages.push(message);

        if (message.type === "GET_SETTINGS") {
          return {
            ok: true,
            settings: {
              backToBackMinutes: 15,
              allowDirectDelete: false,
              confirmBeforeDelete: true,
              includeTransparentEvents: false,
              selectedCalendarIds: ["primary"]
            }
          };
        }

        if (message.type === "GET_CALENDAR_EVENTS") {
          return { ok: true, events };
        }

        if (message.type === "GET_LECTURE_MAPPINGS") {
          return { ok: true, mappings: {} };
        }

        if (message.type === "AUTH_CONNECT_GOOGLE") {
          return { ok: true };
        }

        if (message.type === "UPSERT_SOURCE_LECTURE") {
          return { ok: true, status: "created" };
        }

        if (message.type === "DELETE_CALENDAR_EVENT_BY_LECTURE") {
          return { ok: true, deletedCount: 1 };
        }

        throw new Error(`Unexpected message: ${message.type}`);
      }
    }
  };

  dom.window.fetch = async (input, init = {}) => {
    fetchCalls.push({ url: String(input), method: init.method || "GET", body: String(init.body || "") });
    return jsonResponse(fetchResponse || { resultCode: "success", msg: "성공", cancelAt: "Y" });
  };

  installCommonWindowMocks(dom.window);
  runBrowserScript(dom.window, "src/content/parsers.js");
  runBrowserScript(dom.window, "src/content/lecture-status.js");
  runBrowserScript(dom.window, "src/content/apply.js");

  return { messages, fetchCalls };
}

function createHistoryDom() {
  return createDom(`
    <!doctype html>
    <html>
      <body>
        <div class="boardlist">
          <table>
            <tbody>
              <tr>
                <td>1</td>
                <td class="tit">
                  <a href="/sw/mypage/mentoLec/view.do?qustnrSn=62001">[예시] 접수내역 취소 특강</a>
                </td>
                <td>멘토</td>
                <td>온라인</td>
                <td>2099-05-10(일) 10:00:00 ~ 12:00:00</td>
                <td>-</td>
                <td>접수완료</td>
                <td>정상</td>
                <td>
                  <a href="javascript:delDate('apply-62001','62001','mentoLec')">취소</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `, `${WWW_ORIGIN}/sw/mypage/userAnswer/history.do?menuNo=200047`);
}

function loadHistoryScript(dom, { cancelResponse = { resultCode: "success", cancelAt: "Y" } } = {}) {
  const messages = [];
  const fetchCalls = [];

  dom.window.chrome = {
    runtime: {
      async sendMessage(message) {
        messages.push(message);

        if (message.type === "GET_LECTURE_MAPPINGS") {
          return {
            ok: true,
            mappings: {
              "62001": {
                calendarId: "primary",
                eventId: "calendar-62001",
                qustnrSn: "62001",
                title: "[예시] 접수내역 취소 특강",
                place: "온라인",
                summary: "온라인-[예시] 접수내역 취소 특강",
                startAt: "2099-05-10T10:00:00+09:00",
                endAt: "2099-05-10T12:00:00+09:00",
                detailUrl: `${WWW_ORIGIN}/sw/mypage/mentoLec/view.do?qustnrSn=62001`
              }
            }
          };
        }

        if (message.type === "SYNC_SOURCE_LECTURES") {
          return {
            ok: true,
            stats: { created: 0, updated: 0, unchanged: 1, deleted: 0 }
          };
        }

        if (message.type === "AUTH_CONNECT_GOOGLE") {
          return { ok: true };
        }

        throw new Error(`Unexpected message: ${message.type}`);
      }
    }
  };

  dom.window.fetch = async (input, init = {}) => {
    const url = String(input);
    fetchCalls.push({ url, method: init.method || "GET", body: String(init.body || "") });

    if (url === "/sw/mypage/userAnswer/cancel.json") {
      return jsonResponse(cancelResponse);
    }

    return htmlResponse(dom.serialize());
  };

  installCommonWindowMocks(dom.window);
  runBrowserScript(dom.window, "src/content/parsers.js");
  runBrowserScript(dom.window, "src/content/history.js");

  return { messages, fetchCalls };
}

test("list content script renders status UI on swmaestro root domain and filters by overlap", async () => {
  const dom = createListDom();
  loadContentList(dom, [
    {
      id: "calendar-overlap",
      title: "개인 일정",
      startAt: "2026-05-10T10:30:00+09:00",
      endAt: "2026-05-10T11:00:00+09:00",
      htmlLink: "https://calendar.google.com/event",
      calendarId: "primary"
    }
  ]);

  await waitFor(() => dom.window.document.querySelector(".soma-summary"));

  assert.equal(
    dom.window.document.querySelector(".soma-summary").textContent,
    "일정 체크 결과 · 겹침 1개 | 바로 이어짐 0개 | 겹치지 않음 1개"
  );
  assert.equal(dom.window.document.querySelectorAll(".soma-badge").length, 2);

  dom.window.document
    .querySelector('.soma-filter-bar button[data-filter-key="OVERLAP"]')
    .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  assert.equal(dom.window.document.querySelector('tr[data-id="61001"]').style.display, "");
  assert.equal(dom.window.document.querySelector('tr[data-id="61002"]').style.display, "none");
});

test("native status filter preserves extension date range fields", async () => {
  const dom = createListDom();
  loadContentList(dom, []);

  await waitFor(() => dom.window.document.querySelector(".soma-query-bar"));

  dom.window.document.querySelector('.soma-query-bar input[aria-label="시작일"]').value = "2026-05-01";
  dom.window.document.querySelector('.soma-query-bar input[aria-label="종료일"]').value = "2026-05-31";

  const form = dom.window.document.getElementById("status-filter");
  form.querySelector("button").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));

  assert.equal(form.querySelector('[name="scdate"]').value, "2026-05-01");
  assert.equal(form.querySelector('[name="ecdate"]').value, "2026-05-31");
  assert.equal(form.querySelector('[name="pageQueryString"]').value, "pageIndex=2&scdate=2026-05-01&ecdate=2026-05-31");
});

test("detail apply intercepts SoMA apply success and requests Calendar upsert", async () => {
  const dom = loadDetailDom(
    "example/soma-addschedule.html",
    `${WWW_ORIGIN}/sw/mypage/mentoLec/view.do?qustnrSn=10001`
  );
  const { messages, fetchCalls } = loadApplyScript(dom, {
    fetchResponse: { resultCode: "success", msg: "신청 하였습니다." }
  });

  await waitFor(() => dom.window.document.querySelector("#applyLec"));
  dom.window.document.querySelector("#applyLec").dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));

  await waitFor(() => messages.some((message) => message.type === "UPSERT_SOURCE_LECTURE"));

  assert.equal(fetchCalls[0].url, "/sw/mypage/mentoLec/apply.json");
  assert.ok(fetchCalls[0].body.includes("qustnrSn=10001"));
  const upsert = messages.find((message) => message.type === "UPSERT_SOURCE_LECTURE");
  assert.equal(upsert.payload.qustnrSn, "10001");
  assert.equal(upsert.payload.title, "[예시] 제품 아이디어 검증 워크숍");
});

test("detail cancel intercepts SoMA cancel success and requests Calendar deletion", async () => {
  const dom = loadDetailDom(
    "example/soma-cancelschedule.html",
    `${WWW_ORIGIN}/sw/mypage/mentoLec/view.do?qustnrSn=10002`
  );
  const { messages, fetchCalls } = loadApplyScript(dom, {
    fetchResponse: { resultCode: "success", cancelAt: "Y" }
  });

  await waitFor(() => dom.window.document.querySelector('button[onclick*="applyCancel"]'));
  dom.window.document.querySelector('button[onclick*="applyCancel"]').dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));

  await waitFor(() => messages.some((message) => message.type === "DELETE_CALENDAR_EVENT_BY_LECTURE"));

  assert.equal(fetchCalls[0].url, "/sw/mypage/mentoLec/applyCancel.json");
  assert.ok(fetchCalls[0].body.includes("qustnrSn=10002"));
  const deletion = messages.find((message) => message.type === "DELETE_CALENDAR_EVENT_BY_LECTURE");
  assert.equal(deletion.payload.qustnrSn, "10002");
  assert.equal(deletion.payload.title, "[예시] 시장 검증 실전 세션");
});

test("detail cancel blocks starts within 24 hours before calling SoMA cancel API", async () => {
  const dom = createDom(`
    <!doctype html>
    <html>
      <body>
        <form>
          <input type="hidden" name="qustnrSn" value="10003">
          <div class="bbs-view-new">
            <div class="group"><strong class="t">모집 명</strong><div class="c">[예시] 취소 불가 특강</div></div>
            <div class="group"><strong class="t">강의날짜</strong><div class="c">2020.04.30 14:00시 ~ 16:00시</div></div>
            <div class="group"><strong class="t">장소</strong><div class="c">온라인</div></div>
            <div class="group"><strong class="t">모집인원</strong><div class="c">3명</div></div>
          </div>
        </form>
        <button type="button" onclick="applyCancel('10003','apply-10003');">취소하기</button>
        <div class="boardlist"><table><tbody></tbody></table></div>
      </body>
    </html>
  `, `${WWW_ORIGIN}/sw/mypage/mentoLec/view.do?qustnrSn=10003`);
  const { messages, fetchCalls } = loadApplyScript(dom, {
    fetchResponse: { resultCode: "success", cancelAt: "Y" }
  });

  await waitFor(() => dom.window.document.querySelector('button[onclick*="applyCancel"]'));
  dom.window.document.querySelector('button[onclick*="applyCancel"]').dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(fetchCalls.length, 0);
  assert.equal(messages.some((message) => message.type === "DELETE_CALENDAR_EVENT_BY_LECTURE"), false);
});

test("history cancel link calls SoMA cancel API and reruns history-based Calendar sync", async () => {
  const dom = createHistoryDom();
  const { messages, fetchCalls } = loadHistoryScript(dom);

  await waitFor(() => messages.some((message) => message.type === "SYNC_SOURCE_LECTURES"));

  dom.window.document.querySelector('a[href^="javascript:delDate("]').dispatchEvent(new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true
  }));

  await waitFor(() => fetchCalls.some((call) => call.url === "/sw/mypage/userAnswer/cancel.json"));
  await waitFor(() => messages.filter((message) => message.type === "SYNC_SOURCE_LECTURES").length >= 2);

  const cancelCall = fetchCalls.find((call) => call.url === "/sw/mypage/userAnswer/cancel.json");
  assert.equal(cancelCall.method, "POST");
  assert.ok(cancelCall.body.includes("id=apply-62001"));
  assert.ok(cancelCall.body.includes("qustnrSn=62001"));

  const syncMessages = messages.filter((message) => message.type === "SYNC_SOURCE_LECTURES");
  const latestSync = syncMessages.at(-1);
  assert.equal(latestSync.payload.lectures[0].qustnrSn, "62001");
  assert.equal(latestSync.payload.sourceComplete, true);
});
