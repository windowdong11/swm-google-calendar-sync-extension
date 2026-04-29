const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const { filterLecturesForPanel } = require(
  path.resolve(__dirname, "../../src/calendar/lecture-filter.js")
);

function makeLecture(id, startAt, endAt) {
  return { id, title: `특강 ${id}`, startAt, endAt, url: `https://example.com/${id}` };
}

// 기준 시각: 2026-05-10 KST 10:00 = UTC 2026-05-10T01:00:00Z
const NOW = "2026-05-10T01:00:00.000Z";

test("드래그 없음: now 기준 끝나지 않은 항목만 반환", () => {
  const lectures = [
    // KST 11:00~12:00 → UTC 02:00~03:00 → now(01:00Z) 이후 끝남 → 포함
    makeLecture("A", "2026-05-10T11:00:00+09:00", "2026-05-10T12:00:00+09:00"),
    // 어제 KST 10:00~11:00 → UTC 2026-05-09T01:00~02:00 → 이미 종료 → 제외
    makeLecture("B", "2026-05-09T10:00:00+09:00", "2026-05-09T11:00:00+09:00"),
    // KST 15:00~16:00 → 미래 → 포함
    makeLecture("C", "2026-05-10T15:00:00+09:00", "2026-05-10T16:00:00+09:00"),
  ];

  const result = filterLecturesForPanel(lectures, null, NOW);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((l) => l.id), ["A", "C"]);
});

test("드래그 없음: now 기준 이미 끝난 항목 제외", () => {
  const lectures = [
    // KST 어제 → 이미 끝남
    makeLecture("X", "2026-05-09T10:00:00+09:00", "2026-05-09T11:00:00+09:00"),
  ];

  const result = filterLecturesForPanel(lectures, null, NOW);
  assert.equal(result.length, 0);
});

test("드래그 활성: 완전 포함 케이스 반환 (drag.start === lecture.startAt 경계 포함)", () => {
  const drag = {
    start: "2026-05-10T12:00:00+09:00", // KST 12:00
    end: "2026-05-10T14:00:00+09:00"    // KST 14:00
  };

  const lectures = [
    // 완전 포함: drag.start === lecture.startAt 경계
    makeLecture("A", "2026-05-10T12:00:00+09:00", "2026-05-10T13:00:00+09:00"),
    // 완전 포함: 내부
    makeLecture("B", "2026-05-10T12:30:00+09:00", "2026-05-10T13:30:00+09:00"),
    // 부분 겹침: lecture 끝이 drag 끝 초과
    makeLecture("C", "2026-05-10T13:00:00+09:00", "2026-05-10T15:00:00+09:00"),
    // 부분 겹침: lecture 시작이 drag 시작 미만
    makeLecture("D", "2026-05-10T11:00:00+09:00", "2026-05-10T13:00:00+09:00"),
    // 이미 끝난 항목
    makeLecture("E", "2026-05-09T10:00:00+09:00", "2026-05-09T11:00:00+09:00"),
  ];

  const result = filterLecturesForPanel(lectures, drag, NOW);
  assert.deepEqual(result.map((l) => l.id), ["A", "B"]);
});

test("드래그 활성: 부분 겹침은 제외 (drag 시작 < lecture 시작 < drag 끝 < lecture 끝)", () => {
  const drag = {
    start: "2026-05-10T12:00:00+09:00",
    end: "2026-05-10T14:00:00+09:00"
  };

  // lecture 시작이 drag 안에 있지만 lecture 끝이 drag 밖
  const lectures = [
    makeLecture("A", "2026-05-10T13:00:00+09:00", "2026-05-10T15:00:00+09:00"),
  ];

  const result = filterLecturesForPanel(lectures, drag, NOW);
  assert.equal(result.length, 0);
});

test("빈 lectureSnapshot: 빈 결과", () => {
  const result = filterLecturesForPanel([], null, NOW);
  assert.deepEqual(result, []);
});

test("lectureSnapshot이 null/undefined: 빈 결과", () => {
  assert.deepEqual(filterLecturesForPanel(null, null, NOW), []);
  assert.deepEqual(filterLecturesForPanel(undefined, null, NOW), []);
});

test("드래그 없음: 시간순 정렬", () => {
  const lectures = [
    makeLecture("B", "2026-05-10T15:00:00+09:00", "2026-05-10T16:00:00+09:00"),
    makeLecture("A", "2026-05-10T11:00:00+09:00", "2026-05-10T12:00:00+09:00"),
  ];

  const result = filterLecturesForPanel(lectures, null, NOW);
  assert.deepEqual(result.map((l) => l.id), ["A", "B"]);
});

test("additionalFilters: 모든 predicate가 true인 lecture만 통과 (AND 결합)", () => {
  const lectures = [
    makeLecture("alpha", "2026-05-10T10:00:00+09:00", "2026-05-10T11:00:00+09:00"),
    makeLecture("beta",  "2026-05-10T12:00:00+09:00", "2026-05-10T13:00:00+09:00"),
    makeLecture("gamma", "2026-05-10T14:00:00+09:00", "2026-05-10T15:00:00+09:00"),
  ];
  lectures[0].title = "alpha";
  lectures[1].title = "beta";
  lectures[2].title = "gamma";

  const startsWithA = (lec) => lec.title.startsWith("a");
  const titleHasFiveOrMoreChars = (lec) => lec.title.length >= 5;

  const result = filterLecturesForPanel(lectures, null, NOW, [startsWithA, titleHasFiveOrMoreChars]);
  assert.deepEqual(result.map((l) => l.id), ["alpha"]);
});

test("additionalFilters: 빈 배열이면 기본 필터만 적용", () => {
  const lectures = [
    makeLecture("A", "2026-05-10T11:00:00+09:00", "2026-05-10T12:00:00+09:00"),
  ];

  const result = filterLecturesForPanel(lectures, null, NOW, []);
  assert.deepEqual(result.map((l) => l.id), ["A"]);
});
