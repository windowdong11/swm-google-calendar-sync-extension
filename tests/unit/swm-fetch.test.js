const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const SwmFetch = require("../../src/background/swm-fetch.js");

const ROOT = path.resolve(__dirname, "../..");

test("isLoginPage returns true for SWM login form HTML", () => {
  const html = `
    <html><body>
      <form id="login_form" action="/sw/toLogin.do" method="post">
        <input type="text" name="username" />
        <input type="password" name="password" />
      </form>
    </body></html>
  `;
  assert.equal(SwmFetch.isLoginPage(html), true);
});

test("isLoginPage returns true when only toLogin.do action present", () => {
  const html = `<form action="https://www.swmaestro.ai/sw/toLogin.do"></form>`;
  assert.equal(SwmFetch.isLoginPage(html), true);
});

test("isLoginPage returns false for the current site list fixture", () => {
  const html = fs.readFileSync(path.join(ROOT, "tests/fixtures/site-current/list.html"), "utf8");
  assert.equal(SwmFetch.isLoginPage(html), false);
});

test("LIST_URL contains menuNo=200046", () => {
  assert.match(SwmFetch.LIST_URL, /menuNo=200046/);
});

test("buildListUrl includes menuNo, scdate, ecdate, pageIndex", () => {
  const url = SwmFetch.buildListUrl({ scdate: "2026-01-01", ecdate: "2026-12-31", pageIndex: 3 });
  assert.match(url, /menuNo=200046/);
  assert.match(url, /scdate=2026-01-01/);
  assert.match(url, /ecdate=2026-12-31/);
  assert.match(url, /pageIndex=3/);
});

test("buildListUrl omits pageIndex param when pageIndex is 1", () => {
  const url = SwmFetch.buildListUrl({ scdate: "2026-01-01", ecdate: "2026-12-31", pageIndex: 1 });
  assert.doesNotMatch(url, /pageIndex/);
});

test("buildListUrl omits scdate/ecdate when not provided", () => {
  const url = SwmFetch.buildListUrl({});
  assert.doesNotMatch(url, /scdate/);
  assert.doesNotMatch(url, /ecdate/);
  assert.match(url, /menuNo=200046/);
});

test("fetchListHtml requests URL with menuNo=200046", async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return new Response("<html><body><div class=\"boardlist\"></div></body></html>", {
      status: 200,
      headers: { "Content-Type": "text/html" }
    });
  };

  await SwmFetch.fetchListHtml({ fetchImpl: fakeFetch });

  assert.match(calls[0].url, /menuNo=200046/);
});

test("fetchListHtml returns ok html on 200 response", async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return new Response("<html><body><div class=\"boardlist\"></div></body></html>", {
      status: 200,
      headers: { "Content-Type": "text/html" }
    });
  };

  const result = await SwmFetch.fetchListHtml({ rangeDays: 30, fetchImpl: fakeFetch });

  assert.equal(result.ok, true);
  assert.match(result.html, /boardlist/);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /list\.do/);
  assert.equal(calls[0].opts.credentials, "include");
});

test("fetchListHtml flags authExpired when response HTML is a login page", async () => {
  const fakeFetch = async () =>
    new Response(`<form id="login_form" action="/sw/toLogin.do"></form>`, {
      status: 200,
      headers: { "Content-Type": "text/html" }
    });

  const result = await SwmFetch.fetchListHtml({ fetchImpl: fakeFetch });

  assert.equal(result.ok, false);
  assert.equal(result.authExpired, true);
});

test("fetchListHtml flags authExpired on 302 redirect status", async () => {
  const fakeFetch = async () =>
    new Response("", {
      status: 302,
      headers: { Location: "https://www.swmaestro.ai/sw/toLogin.do" }
    });

  const result = await SwmFetch.fetchListHtml({ fetchImpl: fakeFetch });

  assert.equal(result.ok, false);
  assert.equal(result.authExpired, true);
});

test("fetchListHtml returns error when fetch throws", async () => {
  const fakeFetch = async () => {
    throw new Error("network down");
  };

  const result = await SwmFetch.fetchListHtml({ fetchImpl: fakeFetch });

  assert.equal(result.ok, false);
  assert.equal(result.authExpired, undefined);
  assert.match(result.error, /network down/);
});

test("fetchListHtml returns error on 500 server response", async () => {
  const fakeFetch = async () => new Response("oops", { status: 500 });

  const result = await SwmFetch.fetchListHtml({ fetchImpl: fakeFetch });

  assert.equal(result.ok, false);
  assert.equal(result.authExpired, undefined);
  assert.match(result.error, /500/);
});

test("fetchListHtml passes scdate, ecdate, pageIndex into requested URL", async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return new Response("<html><body><div class=\"boardlist\"></div></body></html>", {
      status: 200,
      headers: { "Content-Type": "text/html" }
    });
  };

  await SwmFetch.fetchListHtml({ scdate: "2026-01-01", ecdate: "2026-12-31", pageIndex: 2, fetchImpl: fakeFetch });

  assert.match(calls[0].url, /scdate=2026-01-01/);
  assert.match(calls[0].url, /ecdate=2026-12-31/);
  assert.match(calls[0].url, /pageIndex=2/);
});
