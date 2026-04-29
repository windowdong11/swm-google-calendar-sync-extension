const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const libUrl = pathToFileURL(
  path.resolve(__dirname, "../../scripts/lib/anonymize.mjs")
).href;
const cliPath = path.resolve(__dirname, "../../scripts/anonymize-fixtures.mjs");

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
  // Use raw names that are NOT in PLACEHOLDER_NAMES so the assertion is sound:
  // placeholders themselves are preserved by design (idempotency).
  const input = `<table><tr><td>김철수</td><td>박영희</td></tr></table>`;
  const out = anonymizeHtml(input);
  assert.doesNotMatch(out, /김철수/);
  assert.doesNotMatch(out, /박영희/);
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

test("digit boundary: 6-digit preserved, 7+ digits masked including 11+", () => {
  // 6-digit boundary: must be preserved (qustnrSn-like).
  const six = `<td>123456</td>`;
  const sixOut = anonymizeHtml(six);
  assert.match(sixOut, />123456</, "6-digit value must be preserved");

  // 7-digit: masked.
  const seven = `<td>1234567</td>`;
  const sevenOut = anonymizeHtml(seven);
  assert.match(sevenOut, />1234567</, "7-digit input collapses to placeholder 1234567");

  // 10-digit: masked.
  const ten = `<td>1234567890</td>`;
  const tenOut = anonymizeHtml(ten);
  assert.doesNotMatch(tenOut, /1234567890/);
  assert.match(tenOut, />1234567</);

  // 11-digit: masked. Use a value that does NOT match the Korean phone regex
  // (which requires 010/011/016/017/018/019 prefix).
  const eleven = `<td>22345678901</td>`;
  const elevenOut = anonymizeHtml(eleven);
  assert.doesNotMatch(elevenOut, /22345678901/, "11-digit non-phone must be masked");
  assert.match(elevenOut, />1234567</);
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
  // Avoid PLACEHOLDER_NAMES values as raw input — those are kept as-is.
  const input = `<td>김철수</td><td>김철수</td><td>박영희</td><td>김철수</td>`;
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

test("CLI exits with code 1 on unknown option", () => {
  const result = spawnSync(process.execPath, [cliPath, "--bogus-flag"], {
    encoding: "utf8"
  });
  assert.equal(result.status, 1, `expected exit code 1, got ${result.status} (stderr: ${result.stderr})`);
  assert.match(result.stderr, /Unknown option/);
});

test("preserves SoMA UI label '비식별 값' (whitelisted compound)", () => {
  const input = `<td class="pc_only">비식별 값</td>`;
  const out = anonymizeHtml(input);
  assert.equal(out, input);
});

test("preserves SoMA UI label '[현재사이트]' (whitelisted compound)", () => {
  const input = `<a>[현재사이트]</a>`;
  const out = anonymizeHtml(input);
  assert.equal(out, input);
});

test("preserves SoMA UI label '강의날짜 :' (whitelisted compound)", () => {
  const input = `<span>강의날짜 : 2026-04-12</span>`;
  const out = anonymizeHtml(input);
  assert.equal(out, input);
});

test("preserves SoMA UI label '접수인원 : 50명' (whitelisted compound)", () => {
  const input = `<span>접수인원 : 50명</span>`;
  const out = anonymizeHtml(input);
  assert.equal(out, input);
});

test("idempotent on real fixtures (list, detail, history)", async () => {
  const fs = require("node:fs");
  for (const f of ["list.html", "detail.html", "history.html"]) {
    const p = path.resolve(__dirname, "../fixtures/site-current", f);
    const orig = fs.readFileSync(p, "utf8");
    const r1 = anonymizeHtml(orig);
    const r2 = anonymizeHtml(r1);
    assert.equal(r1, r2, `${f} idempotent failed`);
    assert.equal(orig, r1, `${f} fixturePreserved failed`);
  }
});

test("placeholder appearing in raw stays untouched and is not remapped", () => {
  // raw "홍길동" coincides with a placeholder. Policy: preserve as-is so a
  // second masking pass does not re-shuffle placeholders.
  const input = `<td>홍길동</td><td>홍길동</td>`;
  const out = anonymizeHtml(input);
  assert.equal(out, input);
});

test("idempotent on synthetic input (placeholder + name + Hangul run)", () => {
  const synthetic = `<div><td>김철수</td><td>홍길동 값</td><span>설명입니다</span></div>`;
  const once = anonymizeHtml(synthetic);
  const twice = anonymizeHtml(once);
  assert.equal(once, twice, "anonymizeHtml must be idempotent on a second pass");
});

test("uuid sentinel does not collide with raw text containing 'UUID_PLACEHOLDER'", () => {
  // Raw HTML happens to contain the literal string "UUID_PLACEHOLDER" (e.g.
  // a comment or inert template token). The internal sentinel must not be
  // confusable with this substring; output must keep the raw token intact and
  // the csrf UUID must be masked exactly once.
  const input = `<!-- UUID_PLACEHOLDER comment --><input name="csrfToken" value="a3f5c2e1-1234-4abc-89de-1234567890ab"><span>literal UUID_PLACEHOLDER text</span>`;
  const out = anonymizeHtml(input);
  assert.doesNotMatch(out, /a3f5c2e1-1234-4abc-89de-1234567890ab/);
  assert.match(out, /00000000-0000-0000-0000-000000000000/);
  // The accidental literal must round-trip untouched (twice).
  const literalCount = (out.match(/UUID_PLACEHOLDER/g) || []).length;
  assert.equal(literalCount, 2, `expected 2 raw UUID_PLACEHOLDER, got ${literalCount} in: ${out}`);
});
