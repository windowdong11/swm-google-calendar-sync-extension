(function () {
  const ORIGIN = "https://www.swmaestro.ai";

  function parseHtmlToLectures(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html || "", "text/html");
    const parsers = globalThis.SomaParsers;
    if (!parsers || typeof parsers.parseListLectures !== "function") {
      throw new Error("SomaParsers.parseListLectures is not available in offscreen document");
    }
    return parsers.parseListLectures(doc, { origin: ORIGIN });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.target !== "offscreen") return false;

    if (message.type === "OFFSCREEN_PARSE_HTML") {
      try {
        const lectures = parseHtmlToLectures(message.payload?.html || "");
        sendResponse({ ok: true, lectures });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
      return false;
    }

    return false;
  });
})();
