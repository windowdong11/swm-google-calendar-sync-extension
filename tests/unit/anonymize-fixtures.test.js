const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const libUrl = pathToFileURL(
  path.resolve(__dirname, "../../scripts/lib/anonymize.mjs")
).href;

let anonymizeHtml;
let PLACEHOLDER_NAMES;

test("load anonymize.mjs", async () => {
  const mod = await import(libUrl);
  anonymizeHtml = mod.anonymizeHtml;
  PLACEHOLDER_NAMES = mod.PLACEHOLDER_NAMES;
  assert.equal(typeof anonymizeHtml, "function");
  assert.ok(Array.isArray(PLACEHOLDER_NAMES));
});

test("masks Korean names in <td> cells with placeholder pool", () => {
  const input = `<table><tr><td>홍길동</td><td>김철수</td></tr></table>`;
  const out = anonymizeHtml(input);
  assert.doesNotMatch(out, /홍길동/);
  assert.doesNotMatch(out, /김철수/);
  const seen = PLACEHOLDER_NAMES.filter((p) => out.includes(p));
  assert.ok(seen.length >= 1, `expected at least 1 placeholder, got: ${out}`);
});

test("preserves Korean whitelist tokens", () => {
  const input = `<th>작성자</th><th>등록일</th><button>신청</button><span>취소</span><td>상태</td><td>없음</td>`;
  const out = anonymizeHtml(input);
  assert.match(out, /작성자/);
  assert.match(out, /등록일/);
  assert.match(out, /신청/);
  assert.match(out, /취소/);
  assert.match(out, /상태/);
  assert.match(out, /없음/);
});

test("masks 7-digit-or-more numbers but preserves shorter qustnrSn-like values", () => {
  const input = `<a href="/sw/mypage/mentoLec/view.do?qustnrSn=20001">링크</a><span>12345678</span><span>30</span><span>123</span>`;
  const out = anonymizeHtml(input);
  assert.match(out, /qustnrSn=20001/, "5-digit qustnrSn must be preserved");
  assert.doesNotMatch(out, /12345678/);
  assert.match(out, /1234567/);
  assert.match(out, />30</);
  assert.match(out, />123</);
});

test("masks emails", () => {
  const input = `<td>foo.bar+1@somasite.kr</td><a href="mailto:abc@example.org">메일</a>`;
  const out = anonymizeHtml(input);
  assert.doesNotMatch(out, /foo\.bar\+1@somasite\.kr/);
  assert.doesNotMatch(out, /abc@example\.org/);
  assert.match(out, /user@example\.com/);
});

test("masks Korean phone numbers in multiple formats", () => {
  const input = `<span>010-1234-5678</span><span>01098765432</span><span>010 5555 6666</span>`;
  const out = anonymizeHtml(input);
  assert.doesNotMatch(out, /1234-5678/);
  assert.doesNotMatch(out, /98765432/);
  assert.doesNotMatch(out, /5555 6666/);
  assert.ok(out.includes("010-0000-0000"), `expected masked phone, got: ${out}`);
});

test("deterministic: same raw name maps to same placeholder", () => {
  const input = `<td>홍길동</td><td>홍길동</td><td>김철수</td><td>홍길동</td>`;
  const out = anonymizeHtml(input);
  const matches = [...out.matchAll(/<td>([^<]+)<\/td>/g)].map((m) => m[1]);
  assert.equal(matches.length, 4);
  assert.equal(matches[0], matches[1], "same raw name must map to same placeholder");
  assert.equal(matches[0], matches[3]);
  assert.notEqual(matches[0], matches[2], "different raw names must map differently");
});

test("preserves tag structure, class, id, data-* attributes", () => {
  const input = `<div class="boardlist" id="grid" data-qustnr-sn="20001"><table class="t"><tbody><tr data-row="1"><td class="tit">홍길동</td></tr></tbody></table></div>`;
  const out = anonymizeHtml(input);
  assert.match(out, /class="boardlist"/);
  assert.match(out, /id="grid"/);
  assert.match(out, /data-qustnr-sn="20001"/);
  assert.match(out, /class="t"/);
  assert.match(out, /data-row="1"/);
  assert.match(out, /class="tit"/);
});

test("preserves inline javascript handlers and function names", () => {
  const input = `<a href="javascript:delDate(20001);">삭제</a><button onclick="applyCancel(20001)">취소</button><script>function search(){ goPage(1); }</script>`;
  const out = anonymizeHtml(input);
  assert.match(out, /javascript:delDate\(20001\)/);
  assert.match(out, /onclick="applyCancel\(20001\)"/);
  assert.match(out, /function search/);
  assert.match(out, /goPage\(1\)/);
});

test("masks csrfToken UUID values while preserving format", () => {
  const input = `<input type="hidden" name="csrfToken" value="a3f5c2e1-1234-4abc-89de-1234567890ab"><input name="_csrf" value="bb112233-4455-6677-8899-aabbccddeeff">`;
  const out = anonymizeHtml(input);
  assert.doesNotMatch(out, /a3f5c2e1-1234-4abc-89de-1234567890ab/);
  assert.doesNotMatch(out, /bb112233-4455-6677-8899-aabbccddeeff/);
  assert.match(out, /00000000-0000-0000-0000-000000000000/);
  assert.match(out, /name="csrfToken"/);
});

test("masks userId and email values inside URL query strings", () => {
  const input = `<a href="/foo?userId=hong123&qustnrSn=20001">링크</a><a href="/bar?email=hong@x.com&page=1">링크2</a>`;
  const out = anonymizeHtml(input);
  assert.doesNotMatch(out, /userId=hong123/);
  assert.doesNotMatch(out, /email=hong@x\.com/);
  assert.match(out, /qustnrSn=20001/);
  assert.match(out, /page=1/);
});

test("preserves ISO datetimes and 2-digit seat counts", () => {
  const input = `<td>2026-04-18T14:00:00+09:00</td><td>30</td><td>50</td>`;
  const out = anonymizeHtml(input);
  assert.match(out, /2026-04-18T14:00:00\+09:00/);
  assert.match(out, />30</);
  assert.match(out, />50</);
});

test("does not change input that has no PII", () => {
  const input = `<table class="t"><thead><tr><th>제목</th><th>상태</th></tr></thead><tbody><tr><td>특강 안내</td><td>진행</td></tr></tbody></table>`;
  const out = anonymizeHtml(input);
  assert.equal(out, input);
});

test("placeholder pool matches spec", () => {
  assert.deepEqual(PLACEHOLDER_NAMES, ["홍길동", "김연수", "박민지", "이서윤", "최지호"]);
});
