"use strict";

const path = require("path");
const fs = require("fs");

const FIXTURE_ROOT = path.resolve(__dirname, "..", "..", "fixtures", "site-current");

function readFixture(name) {
  const p = path.join(FIXTURE_ROOT, name);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8");
}

/**
 * 다중 페이지 폴링 검증용 list.do HTML 생성.
 *
 * parseListLectures가 인식하는 최소 구조:
 *  - .boardlist tbody tr > td.tit > div.rel > a[href*=qustnrSn]
 *  - 강의날짜 td (pc_only 4번째), 접수인원 span
 *
 * count=0 이면 빈 tbody(폴링 종료 신호).
 */
function buildPagedListHtml(count, pageIndex) {
  const rows = [];
  for (let i = 1; i <= count; i++) {
    // qustnrSn은 \d+ 패턴 매칭을 위해 숫자만 사용
    const sn = String(90000 + pageIndex * 100 + i);
    rows.push(`<tr>
      <td class="pc_only">비식별 값</td>
      <td class="tit">
        <div class="rel">
          <a href="/sw/mypage/mentoLec/view.do?qustnrSn=${sn}&amp;menuNo=200046&amp;pageIndex=${pageIndex}&amp;searchStatMentolec=">[E2E-page${pageIndex}] 강의 ${i}</a>
          <div class="ab color-blue block-t"><strong class="color-red">[접수중]</strong></div>
        </div>
        <div class="block-t bbs_m">
          <span>접수기간 : <span>2099-01-01 00:00</span><span>~</span><span>2099-12-31 00:00</span></span>
          <span>강의날짜 : 2099-06-1510:00  ~ 12:00</span>
          <span>접수인원 : 5/10</span>
        </div>
      </td>
      <td class="pc_only" style="white-space: nowrap;">비식별 값</td>
      <td class="pc_only">
        2099-06-15(토)
        <br> 10:00  ~<br class="block-t"> 12:00</td>
      <td class="pc_only">비식별 값</td>
      <td class="pc_only">OK</td>
      <td class="pc_only">비식별 값</td>
      <td class="pc_only">비식별 값</td>
      <td class="pc_only">비식별 값</td>
    </tr>`);
  }
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>
<div class="bbs-top bg">
  <ul class="bbs-total"><li><strong class="color-blue">Total :</strong> 25</li><li><span class="color-blue">${pageIndex}</span>/4 Page</li></ul>
</div>
<div class="boardlist mt50">
  <table class="t"><thead class="pc_only"><tr><th>NO.</th><th>제목</th><th>접수기간</th><th class="sortable">진행날짜</th><th>모집<br>인원</th><th>개설<br>승인</th><th>상태</th><th>작성자</th><th class="sortable">등록일</th></tr></thead>
  <tbody>${rows.join("\n")}</tbody></table>
</div>
</body></html>`;
}

/** 페이지별 강의 수: page1=10, page2=10, page3=5, page4=0(종료) */
const PAGED_COUNTS = { 1: 10, 2: 10, 3: 5, 4: 0 };

/**
 * SoMA(swmaestro.ai) 호출을 ctx 단위로 가로채 fixture HTML로 응답한다.
 *
 * tests/fixtures/site-current/{list,detail,history}.html 재사용.
 * 사용자 옵션으로 path별 HTML 직접 주입 가능.
 *
 * opts.pagedList=true 이면 list.do에 대해 pageIndex 쿼리 파라미터에 따라
 * 다중 페이지 HTML로 분기한다 (B-9/B-10/페이지네이션 회귀 검증용).
 * opts.onListRequest(url) 콜백이 있으면 매 list.do 요청마다 호출한다.
 */
async function routeSoma(ctx, opts = {}) {
  const map = {
    "/sw/mypage/mentoLec/view.do": opts.detailHtml ?? readFixture("detail.html"),
    "/sw/mypage/userAnswer/history.do": opts.historyHtml ?? readFixture("history.html"),
  };
  const jsonOk = JSON.stringify({ ok: true, result: "OK" });
  const jsonEndpoints = new Set([
    "/sw/mypage/mentoLec/apply.json",
    "/sw/mypage/mentoLec/applyCancel.json",
    "/sw/mypage/userAnswer/cancel.json",
  ]);

  const handler = async (route) => {
    const url = new URL(route.request().url());
    if (jsonEndpoints.has(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: jsonOk,
      });
      return;
    }
    if (url.pathname === "/sw/mypage/mentoLec/list.do") {
      if (typeof opts.onListRequest === "function") opts.onListRequest(url);
      let body;
      if (opts.pagedList) {
        const pageIndex = Number(url.searchParams.get("pageIndex") || "1");
        const count = PAGED_COUNTS[pageIndex] ?? 0;
        body = buildPagedListHtml(count, pageIndex);
      } else {
        body = opts.listHtml ?? readFixture("list.html");
      }
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body,
      });
      return;
    }
    if (url.pathname in map) {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: map[url.pathname],
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "text/plain",
      body: "not mocked",
    });
  };

  // SoMA은 www.swmaestro.ai와 swmaestro.ai 둘 다 사용한다.
  await ctx.route("https://swmaestro.ai/**", handler);
  await ctx.route("https://www.swmaestro.ai/**", handler);
}

module.exports = { routeSoma, FIXTURE_ROOT, buildPagedListHtml, PAGED_COUNTS };
