(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.SomaSwmFetch = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MENU_NO = "200046";
  const LIST_URL = `https://www.swmaestro.ai/sw/mypage/mentoLec/list.do?menuNo=${MENU_NO}`;
  const LOGIN_PATTERN = /id=["']login_form["']|name=["']username["']|<form[^>]+action=["'][^"']*toLogin\.do/i;

  function buildListUrl({ scdate, ecdate, pageIndex } = {}) {
    let url = LIST_URL;
    if (scdate) url += `&scdate=${encodeURIComponent(scdate)}`;
    if (ecdate) url += `&ecdate=${encodeURIComponent(ecdate)}`;
    if (pageIndex && pageIndex > 1) url += `&pageIndex=${encodeURIComponent(pageIndex)}`;
    return url;
  }

  function isLoginPage(html) {
    if (typeof html !== "string" || !html) return false;
    return LOGIN_PATTERN.test(html);
  }

  function isLoginRedirect(response) {
    if (!response) return false;
    if (response.status === 302 || response.status === 303) {
      const location = response.headers?.get?.("Location") || "";
      if (/toLogin\.do/i.test(location)) return true;
    }
    if (response.url && /toLogin\.do/i.test(response.url)) return true;
    return false;
  }

  async function fetchListHtml(options = {}) {
    const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!fetchImpl) {
      return { ok: false, error: "fetch is not available in this environment" };
    }

    const url = buildListUrl({
      scdate: options.scdate,
      ecdate: options.ecdate,
      pageIndex: options.pageIndex
    });

    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        credentials: "include",
        redirect: "manual",
        headers: { Accept: "text/html,application/xhtml+xml" }
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (isLoginRedirect(response)) {
      return { ok: false, authExpired: true };
    }

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }

    let html;
    try {
      html = await response.text();
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (isLoginPage(html)) {
      return { ok: false, authExpired: true };
    }

    return { ok: true, html };
  }

  return {
    LIST_URL,
    buildListUrl,
    isLoginPage,
    fetchListHtml
  };
});
