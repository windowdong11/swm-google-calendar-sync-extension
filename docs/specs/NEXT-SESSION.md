# 다음 세션 인계 — SOMA Schedule Helper 신규 기능

이 문서는 **새 세션이 cold start로 픽업할 수 있게** 현재까지 정리된 결정·미결정·차단 사항을 한 곳에 모았다. 다음 세션을 시작하면 이 문서부터 읽고 → 작업 라운드 선택 → 해당 spec 본문으로 들어간다.

---

## 0. 오리엔테이션 (이 순서로 읽기)

1. `docs/agent-guide.md` — 기존 확장의 코드 구조·동작 (변하지 않는 토대)
2. `docs/specs/README.md` — 브랜치 전략·스펙 템플릿·Phase 인덱스
3. **이 문서** (`NEXT-SESSION.md`) — 현재 미결정·차단·다음 작업
4. 작업 대상 spec 본문 (`docs/specs/NN-*.md`)

---

## 1. 직전 세션에서 한 일 (요약)

- 기존 dirty 상태(modified service-worker.js + 신규 테스트 + agent-guide.md)를 의미별 4커밋으로 분할
- spec 디렉토리(`docs/specs/`) 골격 + 메타 README + spec 01~10 draft 작성
- 빈 `swm-schedule-alert/` 디렉토리 폐기, 모든 작업을 `soma-schedule-helper/`로 통합

main 브랜치 신규 커밋:

```
3052c46 docs: add spec drafts for calendar view, filtering, polling, notifications
7e51426 docs: add agent guide for extension internals
500117c test: add content script DOM and manifest host coverage
df5b28f test: cover orphan cancel deletion and active/cancel coexistence in sync
2983c64 fix: preserve lecture summary and dedupe inactive lectures by qustnrSn
```

코드는 한 줄도 추가하지 않았다. 모든 spec은 `Status: draft`.

---

## 2. 사용자 결정 대기 (`@user`) — 묶음별

각 결정의 차단성 분류:
- 🛑 **차단**: 해당 spec 코딩 시작 전 필수
- ⏸️ **부분 차단**: 핵심 경로는 진입 가능, 특정 단계에서만 막힘
- ✅ **비차단**: 코드 작성 중·후반에 결정해도 무방 (상수/플래그 1라인)

결정 완료 항목은 spec 본문에 반영되어 있고, 본 문서에서는 제거됨. 아래 목록이 남은 전부.

### 묶음 A — Round 0 즉답 (6개, 1분 컷, 전부 ✅ 비차단)

NEXT-SESSION 추천안 OK 여부만 답. 한 번에 처리해 spec 진입 마찰 제거.

- [ ] **U-04-1** 자리 여유 임계값(`almostFull`) 옵션화 여부 — 추천: 하드코드 10% 시작, 사용 후 옵션화 검토
- [ ] **U-06-1** `meta-changed` 알림 기본값 — 추천: OFF (자주 발생, 가치 낮음)
- [ ] **U-07-2** 자리 알림 본문에 잔여석 수 표시 — 추천: 표시 (의사결정에 직접 도움)
- [ ] **U-08-2** 알림 큐 보존 기간 기본값 — 추천: 7일 (자리 비울 가능성 큰 케이스 대비)
- [ ] **U-09-2** 멘토 단위 알림 카테고리 세분화 옵션 — 추천: 1차 출시 X, 사용 후 추가
- [ ] **U-10-1** `seat-closed` 알림 기본값 — 추천: OFF (소음 우려, 패턴 분석 원하면 큐에서 확인)

### 묶음 B — Round 1 알림 정책 (4개, 🛑 차단, 정합성 위해 한 번에)

spec 07/08/09/10에 걸쳐 일관된 정책 필요. 따로 따로 결정하면 spec마다 멈춤.

- [ ] **U-07-1** `time/place/meta-changed` 본인 신청만 vs 전체 — 추천: 본인 신청만 (전체는 노이즈)
- [ ] **U-08-1** 큐 항목 액션 버튼 — 추천: 1차 `상세로 이동`·`읽음` 두 개. 후보 (Calendar 추가, 관심 해제, 카테고리 끄기)는 사용 후 추가
- [ ] **U-09-1** 별표 토글 위치 — 추천: 멘토 칩 옆 + 멘토 그룹 헤더(spec 03) 둘 다
- [ ] **U-10-2** 충돌 상태 특강 등록 시 차단 vs 경고 — 추천: 경고만 (사용자 자율)

### 묶음 C — Round 1 spec 진입 직전 (2개, 🛑 차단)

spec 02·04 코딩 첫 단계 결정.

- [ ] **U-02-2** 카테고리 매핑 편집 UI 위치 — 추천: 옵션 페이지 (편집 빈도 낮음)
- [ ] **U-04-2** 텍스트 검색 spec 04 포함 vs 분리 — 추천: 별도 spec(예: `11-text-search.md`)으로 분리

### 묶음 D — B-1 캡처 시 자동 해소 (3개)

B-1(§4)이 들어오면 함께 풀림.

- [ ] 🛑 **U-02-1** 실제 SWM 목록 페이지 카테고리 DOM 위치 (B-1 의존)
- [ ] 🛑 **U-03-1** 실제 SWM 페이지 멘토명 DOM 위치 (B-1 의존)
- [ ] ✅ **U-03-2** 멘토명 표기에 소속 포함 정도 — 추천: 표시는 원문, 매칭은 정규화 키

### 묶음 E — spec 05 옵션 UI 단계 (2개, ⏸️ 부분 차단)

spec 05 핵심 경로(alarm·fetch·storage)는 결정 없이 진입 가능. 옵션 UI 작성 시 결정.

- [ ] **U-05-1** 폴링 활성 안내·동의 — 추천: 옵션 페이지 단순 토글 + 토글 옆 트래픽·배터리 안내 문구
- [ ] **U-05-2** 인증 만료 시 처리 — 추천: 사용자 안내만 (보이지 않는 redirect 추적은 위험)

### 결정 완료 항목 (참고)

- [x] **Spec 01 — 캘린더 뷰** — U-01-1 새 탭 전용 페이지 진입, U-01-2 시간축 08:00~24:00, D-1 데이터 소스 = spec 05 `lectureSnapshot` (D-3 결정)

---

## 3. 명확화 필요 (`@tbd`)

세션 진행 중 코드 작성 시점에 결정 가능한 것들. 사용자 결정이 꼭 필요하진 않지만 결정 전 코딩 진입 시 위험.

| ID | 위치 | 내용 | 예상 결정 시점 |
|---|---|---|---|
| T-01 | spec 01 | 캘린더 셀 충돌 패널: 호버 툴팁 vs 클릭 후 패널 | 캘린더 뷰 코딩 시 |
| T-02 | spec 02 | 와일드카드를 정규식까지 허용할지 | 매핑 UI 설계 시 |
| T-03 | spec 03 | 동명이인 처리 정규화 알고리즘 | 멘토 정규화 함수 작성 시 |
| T-04 | spec 04 | `cancelled` 신청 상태 판정 방법 (접수내역 의존) | 필터 엔진 작성 시 |
| T-05 | spec 05 | content script vs 폴링 결과 충돌 시 우선순위 | 폴링 + content 동시 동작 단계 |
| T-06 | spec 06 | 시리즈 사라짐·재등장 보정 (현재는 removed/added 페어로 노출) | diff 함수 작성 시 |
| T-07 | spec 07 | Windows 포커스 어시스트·DND 안내 문구 | 옵션 페이지 작성 시 |
| T-08 | spec 08 | 같은 lecture 다른 카테고리 알림 묶음 표시 | 팝업 UI 작성 시 |
| T-09 | spec 10 | 자동 제거 시 큐 항목도 같이 정리할지 | watch 모듈 작성 시 |

---

## 4. 차단 항목 (사용자가 직접 작업 필요)

코딩으로 풀 수 없고 **사용자 또는 사용자 환경에서 정보 수집**이 필요한 것.

### B-1 SWM 페이지 실제 DOM 캡처 ⭐ 가장 큰 레버

- **무엇이 필요한가**: SWM 특강 목록·상세 페이지의 카테고리/멘토 컬럼이 어느 DOM 노드에 들어 있는지
- **왜 가장 큰가**: 이 캡처 하나로 묶음 D 결정 3개(U-02-1·U-03-1·U-03-2)가 동시 해소되며 spec 02·03·04·09 진입이 한 번에 잠금 해제됨
- **구체적 행동**:
  1. SWM 특강 목록 페이지(`/sw/mypage/mentoLec/list.do`)와 상세 페이지(`/sw/mypage/mentoLec/view.do`)를 열어 HTML 저장
  2. `mock/list.html`·`mock/view-apply.html`에 동일 구조 추가 (개인 식별 정보는 비식별화)
  3. 이때 카테고리·멘토·정원·신청수가 들어간 행/필드 선택자를 파악
- **막힐 경우 우회**: 사용자가 페이지 캡처를 보내주면 다음 세션에서 `parsers.js` 확장 작업 진행 가능

### B-2 정원·신청수 정보 노출 여부 확인

- **무엇이 필요한가**: 목록 페이지에 정원/applyCnt가 노출되는가, 아니면 상세 페이지에서만 보이는가
- **왜 필요한가**: spec 04(자리 여유 필터), spec 06(seat 이벤트), spec 10(자리 알림) 핵심
- **구체적 행동**: 목록 페이지 행을 보고 잔여석/정원 정보가 있는지 확인. 없다면 폴링이 각 상세 페이지를 N번 추가 fetch해야 하는지(=비용 증가) 의사결정 필요
- **만약 상세에서만 보이면**: spec 05·06에 "상세 페이지 폴링 추가 단계" 항목 보강해야 함

### B-3 SWM 백그라운드 fetch 인증 검증

- **무엇이 필요한가**: 사용자가 swmaestro에 평소 로그인되어 있을 때, service worker의 fetch가 세션 쿠키를 자동으로 동반해 로그인 응답을 받는지 확인
- **왜 필요한가**: spec 05 폴링 핵심 가정
- **구체적 행동**: `feature/05-background-polling` 브랜치에서 service worker에 한 줄짜리 fetch + 응답 본문에 로그인 폼 마커가 있는지 검사하는 디버그 스크립트로 검증. 실패 시 spec 05의 인증 만료 처리·자동 재인증 옵션 재검토.

### B-4 (선택) Chrome OS 알림 권한 동작 확인

- spec 07 작성·테스트 단계에서 사용자 환경(macOS 알림 센터 설정)에서 실제로 표시되는지 확인.

---

## 5. 작업 라운드 (병렬 트랙)

병렬의 핵심 두 축:
- **종축(시간)**: spec 코드 의존 그래프
- **횡축(병렬)**: Claude 코딩 트랙 ∥ 사용자 결정/캡처 트랙

### 5.1 의존성 그래프

```
05 (polling) ────┬── 01 (calendar-view)        ← Round 0, 1
(B-3 검증 의존)   │
                 ├── 06 (diff) ── 07 (notif) ── 08 (queue)
                 │                              │
                 │                              ├── 09 (mentor-watch)
                 │                              └── 10 (lecture-watch, B-2 의존)

B-1 ─── 02 (category) ──┐
   └─── 03 (mentor) ────┼── 04 (filter)
                        └── (parser 확장 공유)
```

**spec ↔ spec 의존 핵심**:
- 01 ← 05 (lectureSnapshot 소비)
- 06 → 07 → 08 (한 흐름)
- 09 ← 03 + 07 + 08
- 10 ← 06 + 07 + 08 + B-2

### 5.2 Round 0 — 시작 직전 (병렬 3개)

| 트랙 | 작업 | 산출물 |
|---|---|---|
| 사용자 | **묶음 A** 결정 6개 일괄 답변 | spec 본문 갱신 commit 1개 |
| 사용자 | **B-1 페이지 캡처** (목록·상세 HTML 비식별화 → `mock/`) | mock fixture 추가 |
| Claude | `feature/05-background-polling` 브랜치 → **B-3 인증 검증** → spec 05 핵심 경로 | spec 05 shipped |

> 사용자 결정 6개는 1분 컷. B-1 캡처는 시간 들지만 Claude의 spec 05 작업과 완전 병렬.

### 5.3 Round 1 — spec 05 머지 후 (병렬 2개)

| 트랙 | 작업 | 의존 |
|---|---|---|
| Claude | `feature/01-calendar-view` → `calendar.html` 렌더 → 머지 | spec 05 ✅ |
| 사용자 | **묶음 B** 알림 정책 4개 + **묶음 C** spec 진입 2개 결정 | — |
| 사용자 | **B-2 확인** (목록 페이지 정원/applyCnt 노출 여부) | spec 06·10 영향 |

> spec 01은 사용자 결정 의존성이 없어 Claude가 단독 진행. 사용자는 이 시간에 알림 정책·범위 결정·B-2 확인을 모아 처리.

### 5.4 Round 2 — 두 트랙 병렬 (B-1 캡처 도착 가정)

```
Track A (service-worker 흐름):     Track B (parsers.js 흐름):
06 (diff) → 07 (notif) → 08        02 (category) → 03 (mentor) → 04 (filter)
```

| 트랙 | spec | 코드 영역 | 사용자 결정 |
|---|---|---|---|
| A | 06 → 07 → 08 | `service-worker.js`, `popup.js` | Round 1에서 처리됨 |
| B | 02 → 03 → 04 | `parsers.js`, 옵션 페이지 | Round 1에서 처리됨 |

**진행 옵션**:
- **(권장) Track A 먼저, B 나중** — 06·07·08은 한 흐름이라 한 세션에 묶어 작업. 머지 후 02·03·04 진입.
- **(고급) worktree 진짜 병렬** — `isolation: "worktree"`로 두 Agent 동시 위임. parsers.js의 02·03 충돌 가능 → Track B 안에서는 02 → 03 순차.

### 5.5 Round 3 — 마무리 (Phase 3)

| spec | 의존 | 비고 |
|---|---|---|
| **09** (멘토 watch) | 03 + 07 + 08 머지 | Track A·B 둘 다 끝나야 |
| **10** (특강 watch) | 06 + 07 + 08 + **B-2 결과** | B-2가 "상세 폴링 필요"로 나오면 spec 05·06 보강 후 진입 |

09·10은 코드 영역 다름(09=parsers/popup, 10=service-worker watch 모듈) → **동시 진행** 가능.

### 5.6 타임라인

```
Round 0 ┃ [Claude: spec 05]                            ┃
        ┃ [User: 묶음A + B-1 캡처]                     ┃
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 1 ┃ [Claude: spec 01]                            ┃
        ┃ [User: 묶음B + 묶음C + B-2]                  ┃
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 2 ┃ [Claude: 06→07→08]   →  [Claude: 02→03→04]   ┃
        ┃ (또는 worktree로 진짜 병렬)                  ┃
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 3 ┃ [Claude: 09 ∥ 10]    (동시 진행 가능)        ┃
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 5.7 병렬 효율 핵심 룰

1. **Round 0에서 B-1을 시작**해야 Round 2 Track B가 막히지 않음. B-1이 가장 큰 레버.
2. **결정은 묶어서**: 묶음 B(U-07-1·U-08-1·U-09-1·U-10-2)를 따로 결정하면 spec 07/08/09/10 진입할 때마다 멈춤.
3. **Track A와 B의 분리**: spec 05 머지 후 두 트랙이 독립이라 세션 단위 분리 가능.
4. **Round 2 worktree 병렬화는 옵션** — 단일 Claude 세션이라면 Track A 먼저 권장.

### 5.8 함정 포인트

- **B-2 결과가 "상세에서만 노출"이면**: spec 05·06에 상세 폴링 단계 추가 필요. **B-2는 Round 1 초반에 빠르게 확인** 권장.
- **parsers.js 충돌**: Track B 안 02·03 진짜 병렬 시 같은 파일 만져 rebase 비용. 02 → 03 순차가 안전.
- **spec 05의 묶음 E**는 옵션 UI 작성 시점에만 필요. Round 0에서 결정 안 해도 됨.

---

## 6. 권장 다음 세션 시작 시퀀스

진입 순서: **Round 0**부터.

1. 사용자가 세션 시작 시 **묶음 A 결정 6개 OK 일괄 답변** (또는 개별 조정).
2. Claude는 한 메시지로:
   - `feature/05-background-polling` 브랜치 생성
   - **첫 단계 = B-3 검증** (service worker fetch 한 줄, 응답이 로그인 페이지인지 판정)
   - 검증 결과 200자 이내 보고
3. B-3 통과 시 spec 05 핵심 경로 구현 (alarm 10분 주기, fetch, parser 재사용, `lectureSnapshot` 저장). 옵션 UI는 최소 토글만.
4. `code-delegate` 스킬로 coder + code-reviewer 위임 (§7 작업 모드 참조).
5. PR/머지 → spec 05 `Status: shipped`로 갱신
6. Round 1 진입 → `feature/01-calendar-view` 브랜치 → `calendar.html` + `chrome.action.onClicked` 핸들러 + 그리드 렌더 구현 + mock fixture 추가.
7. PR/머지 → spec 01 `Status: shipped`로 갱신
8. B-1 입력이 들어와 있으면 Round 2 Track B 진입 가능

병행 가능한 사용자 작업: B-1 페이지 캡처, 묶음 B·C 결정, B-2 확인.

---

## 7. 작업 모드 (운영 패턴)

다음 세션은 **메인 세션 = 오케스트레이터** 패턴으로 진행. 코드 본문은 메인이 직접 읽거나 쓰지 않고 서브에이전트에 위임.

### 7.1 권장 도구 매핑

- **`/code-delegate`** — coder + code-reviewer 순차 위임. spec 작업 기본형.
- **`Agent(Explore)`** — 코드 위치 찾기 (parsers.js, service-worker.js 안쪽 구조 파악).
- **`isolation: "worktree"`** — Round 2 Track A·B 동시 위임 시 필수. 충돌 없는 진짜 병렬.
- **`run_in_background: true`** — Track B 백그라운드 위임 + 메인은 Track A 진행.
- **`claude -p`** — B-3 인증 검증처럼 단발 fetch 작업 (메인 OAuth context 격리).

### 7.2 토큰 절약 룰

- spec 본문·NEXT-SESSION·agent-guide 통째 Read 금지 → Explore Agent 질의로 핵심만 추출
- Agent 응답에 길이 제약 명시 ("200자 이내 보고", "변경 파일 목록만")
- 테스트 로그 long output은 Agent가 흡수, 메인엔 "37 pass / 0 fail" 한 줄
- PR 본문 작성도 Agent에 위임 (git log·diff 읽는 부담 분리)

### 7.3 안티패턴 (피할 것)

- ❌ 메인에서 `Read parsers.js` 후 직접 `Edit` — 200줄이 메인에 흡수됨
- ❌ Agent를 한 메시지에 1개씩 N번 호출 — 직렬화. 병렬은 단일 메시지 다중 호출 필수
- ❌ Agent 보고서를 그대로 사용자에게 relay — 한 번 압축 (CLAUDE.md "끝 요약 1-2문장")
- ❌ 자동화 hook으로 Agent 결과를 SessionStart에 주입 (전역 CLAUDE.md "additionalContext는 짧고 무시 가능한 것만")
- ❌ worktree 안 쓰고 한 브랜치에서 Track A·B 섞기 — 충돌 = 메인 개입 = 토큰 폭증

### 7.4 검증 단계

이 패턴은 **Round 0~1 1~2 spec 실제 돌려보기 전엔 일반화 금지** (전역 CLAUDE.md "자동화 전 수동 선행"). Round 0·1 후 잘 동작하면 프로젝트 auto memory에 feedback 기록, 다른 프로젝트에서도 통하면 mydb `rule` 등록 검토.

---

## 8. 본 문서 갱신 규칙

- 결정 완료된 `@user` 항목은 **이 문서에서 제거**하고 spec 본문에 결정사항 반영
- 새로 발견된 미결정·차단은 본 문서에 추가
- spec이 `shipped` 상태가 되면 해당 섹션을 본 문서에서 제거 (이력은 git log로 추적)
- 본 문서가 비어 가면 모든 신규 기능 작업이 끝났다는 신호

---

## 9. 변경 이력

- 2026-04-28: 초기 인계 문서 작성. spec 01~10 draft 기준의 미결정 항목 모음.
- 2026-04-28: spec 01 결정 반영 — 새 탭 전용 페이지 진입(U-01-1), 시간축 08:00~24:00(U-01-2), 데이터 소스 = spec 05 `lectureSnapshot`(D-3). 작업 순서 05 → 01로 변경. spec 01·05 본문 동기화, 의존 그래프(§5)·권장 시퀀스(§6) 갱신.
- 2026-04-29: §2를 묶음 A~E 구조로 재편(차단성 🛑/⏸️/✅ 분류 추가), §5를 라운드 단위로 재배치(Round 0~3 + 의존성 그래프 + 타임라인 + 병렬 효율 룰 + 함정 포인트), §6 권장 시퀀스를 Round 0 진입 형태로 갱신, **§7 작업 모드 신설**(code-delegate + worktree 병렬, 토큰 절약 룰, 안티패턴), §8/§9 번호 시프트.
