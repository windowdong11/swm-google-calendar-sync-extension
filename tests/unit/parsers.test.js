const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const Parsers = require("../../src/content/parsers.js");

const ROOT = path.resolve(__dirname, "../..");
const ORIGIN = "https://www.swmaestro.ai";

function loadDocument(relativePath, url = `${ORIGIN}/sw/mypage/mentoLec/view.do`) {
  const html = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
  return new JSDOM(html, { url }).window.document;
}

function parseInlineDocument(html, url = `${ORIGIN}/sw/mypage/mentoLec/list.do`) {
  return new JSDOM(html, { url }).window.document;
}

test("parseListLectures extracts list rows and keeps native status text", () => {
  const doc = parseInlineDocument(`
    <div class="boardlist">
      <table class="t">
        <tbody>
          <tr>
            <td class="tit"><div class="rel"><a href="/sw/mypage/mentoLec/view.do?qustnrSn=20001">[예시] 목록 특강</a></div></td>
            <td class="pc_only">멘토</td>
            <td class="pc_only">분야</td>
            <td class="pc_only">2026-04-18(토) 14:00 ~ 16:00</td>
            <td class="pc_only">온라인</td>
            <td class="pc_only">마감</td>
            <td class="pc_only">30</td>
            <td class="pc_only">온라인</td>
            <td class="pc_only">비고</td>
          </tr>
        </tbody>
      </table>
    </div>
  `);

  const lectures = Parsers.parseListLectures(doc, { origin: ORIGIN });

  assert.equal(lectures.length, 1);
  assert.deepEqual(lectures[0], {
    id: "20001",
    title: "[예시] 목록 특강",
    url: `${ORIGIN}/sw/mypage/mentoLec/view.do?qustnrSn=20001`,
    startAt: "2026-04-18T14:00:00+09:00",
    endAt: "2026-04-18T16:00:00+09:00",
    parseFailed: false,
    statusText: "마감",
    rawText: "2026-04-18(토) 14:00 ~ 16:00"
  });
});

test("parseListLectures marks rows with changed date format as parseFailed", () => {
  const doc = parseInlineDocument(`
    <div class="boardlist">
      <table class="t">
        <tbody>
          <tr>
            <td class="tit"><div class="rel"><a href="/sw/mypage/mentoLec/view.do?qustnrSn=20002">[예시] 시간 확인 필요</a></div></td>
            <td class="pc_only">멘토</td>
            <td class="pc_only">분야</td>
            <td class="pc_only">시간 추후 공지</td>
            <td class="pc_only">온라인</td>
            <td class="pc_only">접수중</td>
            <td class="pc_only">30</td>
            <td class="pc_only">온라인</td>
            <td class="pc_only">비고</td>
          </tr>
        </tbody>
      </table>
    </div>
  `);

  const [lecture] = Parsers.parseListLectures(doc, { origin: ORIGIN });

  assert.equal(lecture.id, "20002");
  assert.equal(lecture.parseFailed, true);
  assert.equal(lecture.startAt, "");
  assert.equal(lecture.endAt, "");
  assert.equal(lecture.statusText, "접수중");
});

test("parseDetailLectureInfo extracts apply detail fixture", () => {
  const doc = loadDocument("example/soma-addschedule.html", `${ORIGIN}/sw/mypage/mentoLec/view.do?qustnrSn=10001`);

  const lecture = Parsers.parseDetailLectureInfo(doc, {
    href: `${ORIGIN}/sw/mypage/mentoLec/view.do?qustnrSn=10001`
  });

  assert.equal(lecture.qustnrSn, "10001");
  assert.equal(lecture.title, "[예시] 제품 아이디어 검증 워크숍");
  assert.equal(lecture.place, "온라인(Webex)");
  assert.equal(lecture.applyCnt, 5);
  assert.equal(lecture.appCnt, 1);
  assert.equal(lecture.startAt, "2026-04-24T10:00:00+09:00");
  assert.equal(lecture.endAt, "2026-04-24T12:30:00+09:00");
});

test("parseDetailStatusInfo reports parse failure without throwing", () => {
  const doc = parseInlineDocument(`
    <input type="hidden" name="qustnrSn" value="30001">
    <div class="bbs-view-new">
      <div class="group"><strong class="t">모집 명</strong><div class="c">[예시] 상세 특강</div></div>
      <div class="group"><strong class="t">장소</strong><div class="c">온라인</div></div>
      <div class="group"><strong class="t">강의날짜</strong><div class="c">추후 공지</div></div>
    </div>
  `);

  const lecture = Parsers.parseDetailStatusInfo(doc, { href: `${ORIGIN}/detail` });

  assert.equal(lecture.qustnrSn, "30001");
  assert.equal(lecture.parseFailed, true);
  assert.equal(lecture.startAt, "");
  assert.equal(lecture.endAt, "");
});

test("parseHistoryDocument separates active and removed history rows", () => {
  const doc = loadDocument("example/soma-listlog.html", `${ORIGIN}/sw/mypage/userAnswer/history.do`);

  const parsed = Parsers.parseHistoryDocument(doc, { origin: ORIGIN });

  assert.equal(parsed.incomplete, false);
  assert.equal(parsed.lectures.length, 1);
  assert.equal(parsed.inactiveLectures.length, 1);
  assert.equal(parsed.lectures[0].qustnrSn, "10011");
  assert.equal(parsed.lectures[0].startAt, "2026-04-18T14:00:00+09:00");
  assert.equal(parsed.inactiveLectures[0].qustnrSn, "10012");
});

test("parseHistoryRegistrations extracts cancel parameters for active rows", () => {
  const doc = loadDocument("example/soma-listlog.html", `${ORIGIN}/sw/mypage/userAnswer/history.do`);

  const registrations = Parsers.parseHistoryRegistrations(doc, { origin: ORIGIN });

  assert.equal(registrations.length, 2);
  assert.equal(registrations[0].qustnrSn, "10011");
  assert.equal(registrations[0].applySn, "sample-apply-11");
  assert.equal(registrations[0].gubun, "mentoLec");
  assert.equal(registrations[1].qustnrSn, "10012");
  assert.equal(registrations[1].applySn, "");
});

test("parseHistoryDocument allows active and removed rows for same lecture so sync can prefer final active state", () => {
  const doc = parseInlineDocument(`
    <div class="boardlist">
      <table>
        <tbody>
          <tr>
            <td>1</td>
            <td class="tit"><a href="/sw/mypage/mentoLec/view.do?qustnrSn=40001">[예시] 다시 신청한 특강</a></td>
            <td>멘토</td>
            <td>온라인</td>
            <td>2026-04-21(화) 10:00:00 ~ 12:00:00</td>
            <td>-</td>
            <td>접수대기</td>
            <td>정상</td>
            <td>삭제</td>
          </tr>
          <tr>
            <td>2</td>
            <td class="tit"><a href="/sw/mypage/mentoLec/view.do?qustnrSn=40001">[예시] 다시 신청한 특강</a></td>
            <td>멘토</td>
            <td>온라인</td>
            <td>2026-04-21(화) 10:00:00 ~ 12:00:00</td>
            <td>-</td>
            <td>접수완료</td>
            <td>정상</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  `, `${ORIGIN}/sw/mypage/userAnswer/history.do`);

  const parsed = Parsers.parseHistoryDocument(doc, { origin: ORIGIN });

  assert.equal(parsed.inactiveLectures.length, 1);
  assert.equal(parsed.lectures.length, 1);
  assert.equal(parsed.inactiveLectures[0].qustnrSn, "40001");
  assert.equal(parsed.lectures[0].qustnrSn, "40001");
});

test("parseListLectures supports current site list fixture", () => {
  const doc = loadDocument("tests/fixtures/site-current/list.html", `${ORIGIN}/sw/mypage/mentoLec/list.do`);

  const lectures = Parsers.parseListLectures(doc, { origin: ORIGIN });

  assert.equal(lectures.length, 10);
  assert.equal(lectures.filter((lecture) => lecture.parseFailed).length, 0);
  assert.ok(lectures.every((lecture) => lecture.id && lecture.title && lecture.startAt && lecture.endAt));
});

test("parseHistoryDocument supports current site history fixture", () => {
  const doc = loadDocument("tests/fixtures/site-current/history.html", `${ORIGIN}/sw/mypage/userAnswer/history.do`);

  const parsed = Parsers.parseHistoryDocument(doc, { origin: ORIGIN });
  const registrations = Parsers.parseHistoryRegistrations(doc, { origin: ORIGIN });

  assert.equal(parsed.lectures.length, 9);
  assert.equal(parsed.inactiveLectures.length, 0);
  assert.equal(parsed.incompleteRows.length, 0);
  assert.equal(registrations.length, 9);
});

test("parseDetailLectureInfo supports current site detail fixture", () => {
  const href = `${ORIGIN}/sw/mypage/mentoLec/view.do?qustnrSn=93001`;
  const doc = loadDocument("tests/fixtures/site-current/detail.html", href);

  const lecture = Parsers.parseDetailLectureInfo(doc, { href });

  assert.equal(lecture.qustnrSn, "93001");
  assert.equal(lecture.title, "[현재사이트] 상세 특강");
  assert.equal(lecture.place, "비식별 장소");
  assert.equal(lecture.applyCnt, 20);
  assert.equal(lecture.startAt, "2026-05-31T20:00:00+09:00");
  assert.equal(lecture.endAt, "2026-05-31T22:00:00+09:00");
});
