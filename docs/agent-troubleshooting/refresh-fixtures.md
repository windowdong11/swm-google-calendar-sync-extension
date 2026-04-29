# Fixture 갱신 워크플로우

SoMA 사이트의 DOM이 바뀌면 `tests/fixtures/site-current/`(파서 회귀용)와 `mock/`(브라우저 수동 확인용)을 갱신해야 한다. 이 문서는 raw HTML 캡처 → 비식별화 → 커밋까지의 반복 가능한 절차를 정의한다.

## fixtures/ vs mock/

- `tests/fixtures/site-current/{list,detail,history}.html`: `node --test`가 읽는 회귀용 스냅샷. 실제 DOM 구조와 1:1로 일치해야 한다.
- `mock/{list,view-apply,history}.html`: 전체 목업 모드(브라우저 수동 확인)에서 `mock/index.html`이 로드하는 페이지. UX flow 확인용이라 라벨/장식이 다를 수 있다.

`refresh:fixtures`는 같은 raw 입력으로 양쪽을 갱신할 수 있다.

## 1. Raw HTML 캡처

Chrome 프로필에서 SoMA에 로그인된 상태로 아래 세 페이지를 연다.

| 프로필 | URL | 저장 경로 |
| --- | --- | --- |
| list    | `/sw/mypage/mentoLec/list.do` | `.agent/raw/list.raw.html` |
| detail  | `/sw/mypage/mentoLec/view.do?qustnrSn=…` (신청 가능 특강 하나) | `.agent/raw/view-apply.raw.html` |
| history | `/sw/mypage/userAnswer/history.do` | `.agent/raw/history.raw.html` (선택) |

각 페이지에서 DevTools 또는 우클릭 → "다른 이름으로 저장…" → "웹 페이지, HTML만"을 선택해 위 경로에 저장한다.

`.agent/raw/` 디렉토리는 `.gitignore`에 등재되어 있다. **raw HTML은 절대 커밋하지 않는다.**

## 2. 비식별화 실행

```bash
# 기본: tests/fixtures/site-current/ 갱신
npm run refresh:fixtures

# 미리보기만 (파일 안 씀)
npm run refresh:fixtures -- --dry

# mock/만 갱신
npm run refresh:fixtures -- --target=mock

# 양쪽 동시
npm run refresh:fixtures -- --target=both

# 특정 raw 파일 하나만 처리
npm run refresh:fixtures -- --input=.agent/raw/list.raw.html
```

스크립트는 출력 파일에 잔존 PII가 있는지 자체 검사를 수행하고, 발견 시 비-0 종료한다.

## 3. 마스킹 규칙 요약

`scripts/lib/anonymize.mjs` 참조. 핵심:

- **마스킹**: 한글 이름(2~4자), 7자리 이상 연속 숫자, 이메일, 한국 휴대폰 번호, csrfToken/UUID, URL의 `userId=…`/`email=…` 등 PII 키.
- **보존**: 모든 태그/class/id/data-* 속성, `qustnrSn` 값, ISO 시간, 좌석 수(2자리), inline JS 함수명(`delDate`, `applyCancel`, `goPage`…), `<script>`/`<style>` 블록.
- **결정적**: 같은 raw 이름은 같은 placeholder로 매핑(파서 회귀가 흔들리지 않도록).

규칙을 바꿀 일이 생기면 `tests/unit/anonymize-fixtures.test.js`도 함께 갱신.

## 4. diff 확인 후 커밋

```bash
git diff tests/fixtures/site-current/ mock/
npm test
```

- 의도한 변화(새 컬럼·신규 status 텍스트 등)만 보이는지 확인.
- 우연히 마스킹돼선 안 될 토큰(예: 신규 SoMA 한글 라벨)이 placeholder로 바뀌었다면 `KOREAN_WHITELIST`에 추가하고 비식별화를 다시 돌린다.
- 통과하면 conventional commit으로 push.

## 5. 자격증명 주의

- `.agent/soma-login.local.json`의 `username`/`password`는 raw HTML 어디에도 등장해선 안 되지만, 만약 폼 prefill 등으로 노출됐다면 정규식 기반 일반 마스킹이 잡는지 `--dry`로 먼저 확인한다.
- 자격증명 값은 채팅·로그·문서·fixture·배포 ZIP 어디에도 절대 포함하지 않는다.
