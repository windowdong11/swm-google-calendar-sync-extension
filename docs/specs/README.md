# SOMA Schedule Helper — Spec 디렉토리

이 폴더는 SOMA Schedule Helper 확장프로그램의 **신규·확장 기능 스펙**을 보관한다. 한 기능 = 한 파일 = 한 feature 브랜치 원칙.

스펙은 사람이 읽기 위한 문서이자 **에이전트가 코딩 입력으로 그대로 쓰는 명세**다. 그래서 항목별로 "무엇을 / 어디에 / 어떤 데이터 모델로 / 어떻게 검증" 까지 빠짐없이 적는다. 추상 설명 금지.

작업 흐름은 다음 순서를 가정한다.

1. 새 기능 아이디어 → 이 폴더에 `NN-<short-name>.md` 추가 (main 브랜치)
2. spec 합의 후 `feature/NN-<short-name>` 브랜치 생성
3. spec을 입력으로 코드 작성 + 테스트 추가
4. `mock/` fixture로 수동 확인
5. main 머지, spec의 `Status`를 `shipped`로 갱신

코드 동작에 대한 일반 원리·기존 구조 설명은 [`docs/agent-guide.md`](../agent-guide.md)에 있다. 이 폴더의 spec은 **그 위에 새로 무엇을 만드는가**만 다룬다.

> **새 세션에서 처음 들어왔다면 [`NEXT-SESSION.md`](NEXT-SESSION.md) 부터 본다.** 사용자 결정 대기·차단 항목·다음 작업 단위가 한 곳에 모여 있다.

---

## 1. 브랜치 전략

| 종류 | 이름 규칙 | 용도 |
|---|---|---|
| 메인 | `main` | 안정 배포 가능 상태. 직접 commit 금지(스펙·문서 수정은 예외 가능). |
| 기능 | `feature/NN-<short-name>` | spec 1개에 대응. 예: `feature/01-calendar-view` |
| 임시 | `chore/<topic>`, `fix/<topic>` | 기능 외 잡정리·버그픽스 |

규칙

- 한 feature 브랜치는 **한 spec만** 다룬다. 두 개를 묶고 싶으면 spec을 합치거나 의존 관계를 명시한다.
- 머지는 fast-forward 또는 squash. 머지 후 feature 브랜치 삭제 권장.
- spec 자체 수정은 main에 직접 가능. 단 기능 코드와 동시 변경 시 같은 브랜치에서.
- 커밋 메시지는 conventional commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`. 기존 git log 참고.

---

## 2. 스펙 템플릿

새 spec을 만들 때 아래 골격을 그대로 복사해 사용한다. 비어 있는 섹션은 `없음`으로 표시한다(생략하지 말 것 — 의도적 비움이라는 신호).

```markdown
# Spec NN: <기능 이름>

> Status: draft | in-progress | shipped
> Branch: feature/NN-<short-name>
> Phase: 1 / 2 / 3
> Depends on: (다른 spec id 또는 외부 의존, 없으면 "없음")

## 1. 목적
한 단락. **왜** 이 기능이 필요한가, 사용자가 얻는 가치.

## 2. 사용자 스토리
- as a <역할>, I want <행동>, so that <결과>

## 3. 범위
### 포함
- ...
### 제외 (명시적으로 빼는 것)
- ...

## 4. 동작 시나리오
### Golden path
1. ...
### 엣지 케이스
- ...

## 5. UI 변경
- 페이지: 목록 / 상세 / 접수내역 / 옵션 / 신규
- 위치: 어떤 DOM 컨테이너 / 어떤 영역 옆
- mock fixture: `mock/<file>.html` (확인 시나리오 포함)

## 6. 데이터 모델
타입(JS JSDoc 또는 TypeScript 표기) + 저장 위치(`chrome.storage.local` / `sync` / 메모리 / IndexedDB) 명시.

## 7. 의존성
- 읽기: storage 키 / DOM 구조 / SoMA·Google API
- 쓰기: storage 키 / DOM 변경 / chrome.runtime 메시지
- 호출: background service worker 메시지 / 외부 API

## 8. 변경 / 신규 파일
- 신규: `src/...`, `tests/...`
- 수정: `src/...` (어디를)

## 9. 메시지 프로토콜
신규 `chrome.runtime` 메시지 타입이 있으면:
- `TYPE`: 의미
  - payload: ...
  - response: ...

## 10. 테스트 케이스
- unit: `tests/unit/<file>.test.js` — 무엇을 검증
- DOM/integration: `mock/<file>.html` 또는 `tests/integration/...`
- 수동 확인: 실제 SWM 페이지에서 어떤 절차로

## 11. 비기능 요구사항
- 폴링 빈도, 권한 추가 여부, 성능 상한, 보안·프라이버시 메모

## 12. 미해결 질문
- `@user` 사용자 결정 필요
- `@tbd` 추후 검증 필요

## 13. 관련 링크
- 코드 라인: `path:line`
- 외부 문서: ...
- 관련 spec: NN
```

작성 가이드

- "**언제 / 어디서 / 무엇을 / 어떻게**"가 모두 들어가야 한다. "캘린더 뷰를 만든다"는 spec이 아니다. "특강 목록 페이지의 `.boardlist` 위에 월간 그리드 div를 삽입하고, 행 데이터를 동일한 시간 기준으로 셀에 배치한다" 정도로 적는다.
- 데이터 모델·메시지 프로토콜은 `service-worker.js`의 기존 패턴(예: `extendedProperties.private`, `lectureEventMappings`)과 일관되게.
- 미해결 질문은 절대 비워 두지 말 것. 정말 없으면 `없음`이라 적어 "검토했음"을 표시한다.

---

## 3. Phase 인덱스

기능을 3단계로 나눈다. 단계 안에서는 ID 순서가 작업 순서.

### Phase 1 — Visualization (보기 편하게)
| ID | 제목 | 파일 | Status | 의존 |
|---|---|---|---|---|
| 01 | 캘린더 뷰 | [`01-calendar-view.md`](01-calendar-view.md) | draft | **05 선행 필수** |
| 02 | 카테고리 분류 | [`02-category-classification.md`](02-category-classification.md) | draft | B-1 |
| 03 | 멘토별 분류 | [`03-mentor-classification.md`](03-mentor-classification.md) | draft | B-1 |
| 04 | 목록 필터링 | [`04-list-filtering.md`](04-list-filtering.md) | draft | 02·03 |

### Phase 2 — Infrastructure (수집·알림 인프라)
| ID | 제목 | 파일 | Status | 의존 |
|---|---|---|---|---|
| 05 | 백그라운드 주기 폴링 | [`05-background-polling.md`](05-background-polling.md) | draft | B-3 |
| 06 | 특강 스냅샷·diff | [`06-lecture-snapshot-diff.md`](06-lecture-snapshot-diff.md) | draft | 05 |
| 07 | Chrome notification 통합 | [`07-chrome-notifications.md`](07-chrome-notifications.md) | draft | 06 |
| 08 | 알림 큐 | [`08-notification-queue.md`](08-notification-queue.md) | draft | 07 |

### Phase 3 — User-facing alerts (사용자 알림 기능)
| ID | 제목 | 파일 | Status | 의존 |
|---|---|---|---|---|
| 09 | 관심 멘토 등록·신규 특강 알림 | [`09-mentor-watchlist.md`](09-mentor-watchlist.md) | draft | 03·07·08 |
| 10 | 관심 특강 등록·자리 알림 | [`10-lecture-watchlist.md`](10-lecture-watchlist.md) | draft | 06·07·08·B-2 |

phase 의존 관계: 본래 Phase 1과 Phase 2는 코드상 독립이었으나, **2026-04-28 결정으로 spec 01이 spec 05의 `lectureSnapshot`을 데이터 소스로 사용**하게 되어 phase 1 안의 spec 01만 phase 2의 spec 05에 선행 의존한다. Phase 3은 Phase 2(05·06·07·08) 모두에 의존한다. 작업 진입 순서·차단 항목은 [`NEXT-SESSION.md`](NEXT-SESSION.md) §5·§6 참조.

---

## 4. 변경 이력

- 2026-04-28: 초기 스펙 디렉토리 생성. Phase 인덱스만 등록, 개별 spec 본문은 별도 PR로 추가 예정.
- 2026-04-28: spec 01 결정 반영(새 탭 진입·08:00~24:00·spec 05 데이터 소스 D-3) → Phase 1의 spec 01이 Phase 2의 spec 05에 선행 의존하게 됨. 표에 의존 컬럼 추가.
