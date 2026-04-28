# 다음 세션 인계 — SOMA Schedule Helper 신규 기능

이 문서는 **새 세션이 cold start로 픽업할 수 있게** 현재까지 정리된 결정·미결정·차단 사항을 한 곳에 모았다. 다음 세션을 시작하면 이 문서부터 읽고 → 작업 단위 선택 → 해당 spec 본문으로 들어간다.

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

## 2. 사용자 결정 대기 (`@user`)

각 항목은 **결정 후 해당 spec 본문 갱신** 필요. 결정 없이 코딩 진입 가능한 spec은 따로 표시.

### Spec 01 — 캘린더 뷰
- [ ] **U-01-1** 기본 뷰 모드: `table` vs `month`
  - 추천: `table` (기존 사용자 영향 최소)
- [ ] **U-01-2** 주간 뷰 시간축 범위: `09:00~22:00` vs `00:00~24:00`
  - 추천: 일단 `09:00~22:00` (특강 분포 관찰 후 자동 적응)

### Spec 02 — 카테고리 분류
- [ ] **U-02-1** 실제 SWM 목록 페이지에서 카테고리 정보의 DOM 위치 확인 (▶ 차단 항목 B-1 참조)
- [ ] **U-02-2** 카테고리 매핑 편집 UI 위치: 옵션 페이지 vs 목록 페이지 우클릭 메뉴
  - 추천: 옵션 페이지 (편집 빈도 낮음)

### Spec 03 — 멘토 분류
- [ ] **U-03-1** 실제 SWM 페이지에서 멘토명 DOM 위치 확인 (▶ B-1)
- [ ] **U-03-2** 멘토명 표기에 소속 포함 정도(예: `홍길동` vs `홍길동 / OO대` vs `홍길동(OO)`)
  - 추천: 표시는 원문, 매칭은 정규화 키

### Spec 04 — 목록 필터링
- [ ] **U-04-1** 자리 여유 임계값(`almostFull`) 옵션화 여부
  - 추천: 하드코드 10% 시작, 사용 후 옵션화 검토
- [ ] **U-04-2** 텍스트 검색을 본 spec에 포함 vs 별도 spec 분리
  - 추천: 별도 spec(예: `11-text-search.md`)으로 분리해 본 spec을 가볍게 유지

### Spec 05 — 백그라운드 폴링
- [ ] **U-05-1** 폴링 활성 안내·동의: 첫 진입 modal vs 단순 토글
  - 추천: 옵션 페이지 단순 토글 + 토글 옆 트래픽·배터리 안내 문구
- [ ] **U-05-2** 인증 만료 시 자동 재인증 시도 vs 사용자 안내만
  - 추천: 사용자 안내만(보이지 않는 redirect 추적은 위험)

### Spec 06 — 스냅샷·diff
- [ ] **U-06-1** `meta-changed` 알림 기본값: ON vs OFF
  - 추천: OFF (자주 발생, 가치 낮음)

### Spec 07 — Chrome notification
- [ ] **U-07-1** `time/place/meta-changed`는 본인 신청 특강에만 vs 전체에
  - 추천: 본인 신청만 (전체는 노이즈)
- [ ] **U-07-2** 자리 알림 본문에 잔여석 수 표시 여부
  - 추천: 표시 (의사결정에 직접 도움)

### Spec 08 — 알림 큐
- [ ] **U-08-1** 큐 항목 액션 버튼: `상세로 이동` `읽음` 외에 추가할 것
  - 후보: `Google Calendar에 추가`, `관심 해제`, `알림 카테고리 끄기`
  - 추천: 1차 출시는 기본 두 개만, 사용 보고 추가
- [ ] **U-08-2** 보존 기간 기본값: 24h vs 7일
  - 추천: 7일 (자리 비울 가능성 큰 케이스 대비)

### Spec 09 — 관심 멘토
- [ ] **U-09-1** 별표 토글 위치: 멘토 칩 옆 + 멘토 그룹 헤더(spec 03)도?
  - 추천: 둘 다 (헤더에 1번, 행마다 칩에 1번)
- [ ] **U-09-2** 멘토 단위 알림 카테고리 세분화 옵션 필요 여부
  - 추천: 1차 출시 X, 사용 후 추가

### Spec 10 — 관심 특강
- [ ] **U-10-1** `seat-closed` 알림 기본값: ON vs OFF
  - 추천: OFF (소음 우려, 패턴 분석 원하면 큐에서 확인)
- [ ] **U-10-2** 충돌 상태 특강에 관심 등록 시: 차단 vs 경고
  - 추천: 경고만 (사용자 자율)

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

### B-1 SWM 페이지 실제 DOM 캡처
- **무엇이 필요한가**: SWM 특강 목록·상세 페이지의 카테고리/멘토 컬럼이 어느 DOM 노드에 들어 있는지
- **왜 필요한가**: spec 02·03이 의존, 그것 없이는 spec 04·09·10도 진입 불가
- **구체적 행동**:
  1. SWM 특강 목록 페이지 (`/sw/mypage/mentoLec/list.do`)와 상세 페이지(`/sw/mypage/mentoLec/view.do`)를 열어 HTML 저장
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

## 5. 작업 가능 단위 (의존 그래프)

```
            ┌── 01 (calendar-view) ───┐
            │                         │
B-1 ─── 02 (category) ──┐             │
   └─── 03 (mentor) ────┼── 04 (filter)
                        │
                        ├── (parser 확장 공유)
                        │
       05 (polling) ────┼── 06 (diff) ── 07 (notif) ── 08 (queue)
       (B-2, B-3 의존)  │                              │
                        │                              │
                        └─────────────────── 09 (mentor-watch)
                                          ┌── 10 (lecture-watch)
                                          │
                                       06+07+08+B-2 의존
```

### 5.1 즉시 시작 가능
- **`feature/01-calendar-view`** — 추가 데이터 의존 없음. U-01-1, U-01-2만 결정하면 진입.
- **`feature/05-background-polling` (skeleton만)** — alarm 등록·옵션 UI·`fetch` 호출까지는 B-3 검증 없이도 작성 가능. 단, 실제 인증 검증 전엔 PR 머지 보류.

### 5.2 B-1 해결 후 시작 가능
- `feature/02-category-classification`
- `feature/03-mentor-classification`
- 두 개의 parser 확장이 같은 파일을 만지므로 **순차** 처리 추천 (02 → 03 → rebase).

### 5.3 02·03 머지 후 시작 가능
- `feature/04-list-filtering` (메타데이터 의존)
- `feature/09-mentor-watchlist` (mentorKey 의존)

### 5.4 05·06·07·08 일괄 작업 단계
- spec 5~8은 한 흐름이라 **하나의 작업 세션에서 같이** 진행하는 게 자연스러움. 각 브랜치는 분리하되 PR을 순서대로 머지(05 → 06 → 07 → 08).

### 5.5 마지막 단계
- `feature/10-lecture-watchlist` — 모든 인프라(05~08) + B-2(자리 정보) 검증 완료 후

---

## 6. 권장 다음 세션 시작 시퀀스

가장 마찰이 적은 진입은 **spec 01부터**. 그 사이에 사용자가 B-1(페이지 캡처)을 진행하면, 이어서 02·03을 빠르게 처리할 수 있다.

1. 사용자에게 U-01-1, U-01-2 결정 요청
2. spec 01 본문 갱신 (결정 반영, `Status: in-progress`)
3. `feature/01-calendar-view` 브랜치 생성
4. `code-delegate` 스킬로 coder + code-reviewer 위임 (또는 직접 작성)
5. mock/list.html에 캘린더 검증 시나리오 추가 → 수동 확인
6. PR/머지 → spec 01 `Status: shipped`로 갱신
7. B-1 입력이 들어와 있으면 spec 02·03으로 진입

병행 가능한 사용자 작업: B-1 페이지 캡처, U-02·03·04 결정.

---

## 7. 본 문서 갱신 규칙

- 결정 완료된 `@user` 항목은 **이 문서에서 제거**하고 spec 본문에 결정사항 반영
- 새로 발견된 미결정·차단은 본 문서에 추가
- spec이 `shipped` 상태가 되면 해당 섹션을 본 문서에서 제거 (이력은 git log로 추적)
- 본 문서가 비어 가면 모든 신규 기능 작업이 끝났다는 신호

---

## 8. 변경 이력

- 2026-04-28: 초기 인계 문서 작성. spec 01~10 draft 기준의 미결정 항목 모음.
