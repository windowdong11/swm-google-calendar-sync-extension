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
 * SoMA(swmaestro.ai) 호출을 ctx 단위로 가로채 fixture HTML로 응답한다.
 *
 * tests/fixtures/site-current/{list,detail,history}.html 재사용.
 * 사용자 옵션으로 path별 HTML 직접 주입 가능.
 */
async function routeSoma(ctx, opts = {}) {
  const map = {
    "/sw/mypage/mentoLec/list.do": opts.listHtml ?? readFixture("list.html"),
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

module.exports = { routeSoma, FIXTURE_ROOT };
