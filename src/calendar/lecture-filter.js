/**
 * filterLecturesForPanel — 순수 함수, DOM/chrome API 의존 없음.
 *
 * @param {Array<{id:string,title:string,startAt:string,endAt:string,url:string}>} lectures
 * @param {{start:string,end:string}|null} dragRange  - null이면 드래그 비활성
 * @param {Date|string|number} now                    - 인자로 받아 deterministic 보장
 * @param {Array<(lec:object) => boolean>} [additionalFilters]
 *        spec 02·03·04 (카테고리/멘토/필터)가 추후 plug-in할 predicate 배열.
 *        모든 predicate가 true를 반환해야 통과(AND 결합).
 * @returns {Array} 필터된 lecture 배열 (시간순)
 */
function filterLecturesForPanel(lectures, dragRange, now, additionalFilters = []) {
  if (!Array.isArray(lectures) || lectures.length === 0) return [];

  const nowMs = new Date(now).getTime();

  const notEnded = lectures.filter((lec) => {
    const endMs = new Date(lec.endAt).getTime();
    return endMs > nowMs;
  });

  const dragFiltered = dragRange
    ? notEnded.filter((lec) => {
        const dragStart = new Date(dragRange.start).getTime();
        const dragEnd = new Date(dragRange.end).getTime();
        const lecStart = new Date(lec.startAt).getTime();
        const lecEnd = new Date(lec.endAt).getTime();
        return dragStart <= lecStart && lecEnd <= dragEnd;
      })
    : notEnded;

  const pluginFiltered = additionalFilters.length
    ? dragFiltered.filter((lec) => additionalFilters.every((fn) => fn(lec)))
    : dragFiltered;

  return pluginFiltered.slice().sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
}

// CJS export for Node tests; also expose as global for browser <script> tag use.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { filterLecturesForPanel };
} else if (typeof window !== "undefined") {
  window.LectureFilter = { filterLecturesForPanel };
}
