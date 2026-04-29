// Anonymizes SoMA raw HTML for fixture/mock use.
//
// Pure functions only — no fs, no process — so the same module powers both the
// CLI in scripts/anonymize-fixtures.mjs and the unit tests in
// tests/unit/anonymize-fixtures.test.js.

export const PLACEHOLDER_NAMES = [
  "홍길동",
  "김연수",
  "박민지",
  "이서윤",
  "최지호"
];

// Korean tokens that look like names by length but are UI/labels we must keep.
// Anything matched here is exempt from name-masking.
const KOREAN_WHITELIST = new Set([
  // status / actions
  "보기", "신청", "취소", "상세", "진행", "등록", "예정", "완료", "종료",
  "대기", "마감", "모집", "인원", "개설", "승인", "상태", "검색", "초기화",
  "전체", "제목", "내용", "목록", "다음", "이전", "처음", "마지막", "없음",
  "있음", "필수", "선택", "메뉴", "홈",
  // header / labels
  "접수기간", "진행날짜", "작성자", "등록일", "수정일", "조회수", "분야",
  "구분", "지역", "유형", "방식", "장소", "일시", "기간", "기관", "담당",
  "공지", "안내", "문의", "회원", "정보", "사이트", "프로필",
  // auth
  "로그인", "로그아웃",
  // brand
  "소프트웨어", "마에스트로",
  // calendar weekday markers (단일 음절은 정규식이 잡지 않지만 안전 차원)
  "월", "화", "수", "목", "금", "토", "일",
  // common verbs/state words
  "변경", "삭제", "추가", "이동", "확인", "닫기", "열기", "저장", "입력",
  "출력", "조회", "결과", "오류", "성공", "실패", "처리", "요청",
  // generic noun fragments observed in SWM templates
  "특강", "강의", "수업", "교육", "자료", "공통", "기본",
  // common service / role nouns that should not be PII-masked
  "멘토", "멘티", "참가", "참여", "세미나", "워크숍", "온라인", "오프라인"
]);

// Match the FULL Hangul run (≥2 chars). Using a greedy run rather than {2,4}
// avoids the failure mode where a 5-char raw like "설명입니다" gets sliced into
// "설명입니" (4 chars masked to a 3-char placeholder) leaving the trailing "다"
// to fuse with the placeholder into a new Hangul token on the next pass.
const HANGUL_NAME_RE = /[가-힣]{2,}/g;
const LONG_DIGIT_RE = /\b\d{7,}\b/g;
const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w{2,}/g;
const PHONE_RE = /\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/g;
const UUID_RE = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;

const QUERY_PII_KEYS = ["userId", "userid", "user_id", "email", "mail", "tel", "phone", "mobile", "name", "userName", "username"];

const PLACEHOLDER_EMAIL = "user@example.com";
const PLACEHOLDER_PHONE = "010-0000-0000";
const PLACEHOLDER_UUID = "00000000-0000-0000-0000-000000000000";
const PLACEHOLDER_LONG_DIGIT = "1234567";

// Skip masking inside these tags — they hold inline JS that the parser depends
// on (function names, data structures, etc.). Style is also skipped to keep
// CSS untouched.
const SKIP_TAG_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;

function maskQueryString(href) {
  // href can be relative or absolute. Only touch the query part if present.
  const qIndex = href.indexOf("?");
  if (qIndex === -1) return href;
  const base = href.slice(0, qIndex);
  const query = href.slice(qIndex + 1);
  const rebuilt = query
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return pair;
      const key = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (!QUERY_PII_KEYS.includes(key)) return pair;
      // value may itself contain @ etc; replace wholesale.
      if (key.toLowerCase().includes("mail")) return `${key}=${PLACEHOLDER_EMAIL}`;
      if (/tel|phone|mobile/i.test(key)) return `${key}=${PLACEHOLDER_PHONE}`;
      return `${key}=anon`;
    })
    .join("&");
  return `${base}?${rebuilt}`;
}

function maskHrefAttributes(html) {
  return html.replace(/\b(href|action|src)\s*=\s*"([^"]*)"/gi, (full, attr, value) => {
    // Preserve javascript: handlers untouched.
    if (/^javascript:/i.test(value)) return full;
    return `${attr}="${maskQueryString(value)}"`;
  });
}

// Sentinel suffix is a unique 4-hex chosen to have ~zero collision probability
// with raw HTML. Used by both UUID and name protection paths.
const NAME_SENTINEL_PREFIX = "__SOMA_NAME_SENTINEL_";
const NAME_SENTINEL_SUFFIX = "_a3b1__";

function nameSentinel(idx) {
  return `${NAME_SENTINEL_PREFIX}${idx}${NAME_SENTINEL_SUFFIX}`;
}

const NAME_SENTINEL_RE = new RegExp(
  `${NAME_SENTINEL_PREFIX}(\\d+)${NAME_SENTINEL_SUFFIX}`,
  "g"
);

const PLACEHOLDER_NAMES_SET = new Set(PLACEHOLDER_NAMES);

// Skip masking when the matched name appears as part of a longer Hangul token
// that includes a whitelisted term. Catches compounds like "강의시작",
// "사이트현재" that would otherwise be re-split by the Hangul regex.
function isInsideWhitelistedCompound(text, matchStart, matchEnd) {
  let left = matchStart;
  while (left > 0 && /[가-힣]/.test(text[left - 1])) left -= 1;
  let right = matchEnd;
  while (right < text.length && /[가-힣]/.test(text[right])) right += 1;
  if (left === matchStart && right === matchEnd) return false;
  const compound = text.slice(left, right);
  if (KOREAN_WHITELIST.has(compound)) return true;
  for (const term of KOREAN_WHITELIST) {
    if (term.length >= 2 && compound.includes(term)) return true;
  }
  return false;
}

function matchContainsWhitelistedTerm(match) {
  if (KOREAN_WHITELIST.has(match)) return true;
  for (const term of KOREAN_WHITELIST) {
    if (term.length >= 2 && match.includes(term)) return true;
  }
  return false;
}

function buildNameMapper() {
  const cache = new Map();
  // Maps sentinel index -> placeholder Hangul, restored after all masking.
  const sentinelToPlaceholder = new Map();
  let counter = 0;
  let sentinelCounter = 0;

  function mapName(raw) {
    if (KOREAN_WHITELIST.has(raw)) return raw;
    // Existing placeholders flowing in from a prior anonymize pass must remain
    // stable — otherwise idempotency is broken by round-robin reassignment.
    if (PLACEHOLDER_NAMES_SET.has(raw)) return raw;
    if (cache.has(raw)) return cache.get(raw);
    // Round-robin pool, but skip a placeholder that would equal the raw name
    // (e.g. raw "홍길동" must not stay as "홍길동" — defeats anonymization).
    let placeholder = PLACEHOLDER_NAMES[counter % PLACEHOLDER_NAMES.length];
    if (placeholder === raw) {
      counter += 1;
      placeholder = PLACEHOLDER_NAMES[counter % PLACEHOLDER_NAMES.length];
    }
    counter += 1;
    cache.set(raw, placeholder);
    return placeholder;
  }

  function reserveSentinel(placeholder) {
    const idx = sentinelCounter;
    sentinelCounter += 1;
    sentinelToPlaceholder.set(String(idx), placeholder);
    return nameSentinel(idx);
  }

  function restore(html) {
    return html.replace(NAME_SENTINEL_RE, (full, idx) => {
      const replacement = sentinelToPlaceholder.get(idx);
      return replacement === undefined ? full : replacement;
    });
  }

  return { mapName, reserveSentinel, restore };
}

function maskKoreanNamesInText(text, mapper) {
  return text.replace(HANGUL_NAME_RE, (match, offset) => {
    if (isInsideWhitelistedCompound(text, offset, offset + match.length)) {
      return match;
    }
    if (matchContainsWhitelistedTerm(match)) return match;
    const mapped = mapper.mapName(match);
    if (mapped === match) return match;
    // Wrap mapped placeholder in a sentinel so subsequent passes (or a second
    // call) cannot re-match it as a Hangul name.
    return mapper.reserveSentinel(mapped);
  });
}

function processSegmentsOutsideSkipTags(html, transform) {
  // Walk the html, leaving <script>/<style> blocks untouched.
  let out = "";
  let lastIndex = 0;
  SKIP_TAG_RE.lastIndex = 0;
  let m;
  while ((m = SKIP_TAG_RE.exec(html)) !== null) {
    const before = html.slice(lastIndex, m.index);
    out += transform(before);
    out += m[0];
    lastIndex = m.index + m[0].length;
  }
  out += transform(html.slice(lastIndex));
  return out;
}

// Mask Korean names only inside text nodes (between > and <) so we never
// touch tag/attribute names or class lists.
function maskNamesInTextNodes(html, mapper) {
  return html.replace(/>([^<]*)</g, (full, text) => {
    if (!text || !/[가-힣]/.test(text)) return full;
    return `>${maskKoreanNamesInText(text, mapper)}<`;
  });
}

function maskCsrfTokenValues(html) {
  // Replace value="..." next to csrfToken/_csrf inputs as well as plain UUIDs.
  let out = html.replace(
    /(name\s*=\s*"(?:csrfToken|_csrf|csrf|XSRF-TOKEN)"\s+value\s*=\s*")([^"]*)(")/gi,
    (full, pre, _val, post) => `${pre}${PLACEHOLDER_UUID}${post}`
  );
  out = out.replace(
    /(value\s*=\s*"[^"]*"\s+name\s*=\s*"(?:csrfToken|_csrf|csrf|XSRF-TOKEN)")/gi,
    (full) => full.replace(/value\s*=\s*"[^"]*"/, `value="${PLACEHOLDER_UUID}"`)
  );
  out = out.replace(UUID_RE, PLACEHOLDER_UUID);
  return out;
}

/**
 * Anonymize a SoMA raw HTML capture.
 *
 * Preserves: tag structure, class/id/data-* attributes, qustnrSn values,
 * applyCnt/appCnt, ISO datetimes, inline JS handler names, <script>/<style>
 * blocks, and 2 to 6 digit numbers (seat counts / qustnrSn).
 *
 * Masks: Korean names (with deterministic placeholder pool), 7+ digit
 * numbers, emails, Korean phone numbers, csrfToken/UUID values, and PII
 * query string parameters.
 *
 * @param {string} html
 * @param {{ profile?: 'list'|'detail'|'history' }} [opts]
 * @returns {string}
 */
export function anonymizeHtml(html, opts = {}) {
  if (typeof html !== "string") {
    throw new TypeError("anonymizeHtml expects a string");
  }
  void opts; // profile not yet used — reserved for future per-page tweaks.

  const mapper = buildNameMapper();

  // Sentinel keeps the placeholder UUID safe from later digit/email passes.
  const UUID_SENTINEL = "__SOMA_UUID_SENTINEL_7f3a__";

  const transformed = processSegmentsOutsideSkipTags(html, (segment) => {
    let s = segment;
    // Order matters: csrf/UUID first → swap to sentinel so the placeholder
    // UUID's digit blocks aren't re-masked by later passes.
    s = maskCsrfTokenValues(s).split(PLACEHOLDER_UUID).join(UUID_SENTINEL);
    s = maskHrefAttributes(s);
    s = s.replace(PHONE_RE, PLACEHOLDER_PHONE);
    s = s.replace(EMAIL_RE, PLACEHOLDER_EMAIL);
    s = s.replace(LONG_DIGIT_RE, PLACEHOLDER_LONG_DIGIT);
    s = maskNamesInTextNodes(s, mapper);
    s = s.split(UUID_SENTINEL).join(PLACEHOLDER_UUID);
    return s;
  });
  return mapper.restore(transformed);
}

/**
 * Convenience: report tokens in the output that look like leftover PII.
 * Used by the CLI self-check to fail loudly when masking misses something.
 *
 * @param {string} html
 * @returns {string[]} list of suspicious snippets (empty on success).
 */
export function findResidualPii(html) {
  const findings = [];
  const cleaned = html.replace(SKIP_TAG_RE, "");
  // Emails and phones that aren't the placeholders.
  for (const m of cleaned.matchAll(EMAIL_RE)) {
    if (m[0] !== PLACEHOLDER_EMAIL) findings.push(`email:${m[0]}`);
  }
  for (const m of cleaned.matchAll(PHONE_RE)) {
    if (m[0] !== PLACEHOLDER_PHONE) findings.push(`phone:${m[0]}`);
  }
  for (const m of cleaned.matchAll(LONG_DIGIT_RE)) {
    if (m[0] !== PLACEHOLDER_LONG_DIGIT) findings.push(`digits:${m[0]}`);
  }
  for (const m of cleaned.matchAll(UUID_RE)) {
    if (m[0] !== PLACEHOLDER_UUID) findings.push(`uuid:${m[0]}`);
  }
  return findings;
}
