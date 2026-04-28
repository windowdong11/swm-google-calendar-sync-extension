# Spec 05: 백그라운드 주기 폴링

> Status: draft
> Branch: feature/05-background-polling
> Phase: 2 (단, **spec 01 calendar-view의 선행 의존성**으로 작업 순서상 가장 먼저 진입)
> Depends on: 없음 (단, 06 스냅샷 spec과 한 짝으로 동작)

> ⚠️ **작업 순서 메모**: 원래 Phase 2 인프라이지만 spec 01(캘린더 뷰)이 본 spec의 `lectureSnapshot`을 데이터 소스로 삼게 되어, **본 spec이 가장 먼저 머지되어야** 후속 spec 01을 코딩할 수 있다. 본 spec PR 머지 → spec 01 진입 순서 유지.

## 1. 목적

자리 알림·신규 특강 알림은 사용자가 SWM 페이지를 열고 있지 않을 때도 동작해야 한다. **`chrome.alarms` 기반 service worker 주기 폴링**으로 특강 목록을 백그라운드에서 가져와 캐시하고, 변경분(spec 06)을 기반으로 알림(spec 07)을 띄운다. 또한 spec 01의 캘린더 페이지가 본 폴링 결과(`lectureSnapshot`)를 그대로 읽어 그린다.

본 spec은 **수집 부분만** 다룬다. 변경 감지는 spec 06, 알림은 spec 07, 캘린더 렌더는 spec 01.

## 2. 사용자 스토리

- as a 연수생, I want SWM 페이지를 따로 열지 않아도 새 특강·자리 변동을 추적하고, so that 일하다가 놓치지 않는다.
- as a 사용자, I want 폴링 주기·범위를 조절해 서버 부담·배터리 영향을 통제하고, so that 과한 트래픽 없이 운영한다.

## 3. 범위

### 포함
- `chrome.alarms` API로 주기적 wake-up
- service worker가 SWM 특강 목록 페이지를 fetch (사용자 세션 쿠키 사용)
- 응답 HTML에서 lecture 배열 추출 (`parsers.js` 재사용)
- 결과를 `chrome.storage.local`의 `lectureSnapshot`에 저장 (spec 06이 사용)
- 폴링 활성/비활성 토글, 주기, 조회 날짜 범위 설정
- 폴링 실패 시 재시도(exponential backoff, 최대 N회)
- 사용자가 SWM 비로그인 상태이면 폴링 중지 + 옵션 페이지에 안내

### 제외
- 변경 감지(=spec 06), 알림 표시(=spec 07), 알림 큐(=spec 08)
- 멘토·카테고리 별 부분 폴링(전체 목록을 한 번에)
- 페이지가 떠 있을 때 content script로부터의 polling (백그라운드만)

## 4. 동작 시나리오

### Golden path
1. 확장 설치/업데이트 시 `chrome.runtime.onInstalled`에서 alarm 등록.
2. 옵션 페이지에서 사용자가 폴링 활성화 + 주기(분) + 조회 범위(예: 오늘+30일) 설정.
3. 매 alarm fire마다 service worker가:
   a. SWM 특강 목록 URL을 GET (날짜 범위 쿼리스트링 포함)
   b. HTML 파싱 → lecture 배열
   c. 배열을 `lectureSnapshot`에 저장 + `lastPolledAt` 업데이트
   d. (spec 06) diff 계산 호출 (이벤트 publish)
4. 실패 시 backoff (예: 1m → 5m → 15m, 이후 1시간 간격으로 재시도). 연속 N회 실패 시 폴링 일시 정지 + 옵션 페이지 배너.

### 엣지 케이스
- SWM 응답이 로그인 페이지(302 리다이렉트 또는 로그인 폼 HTML)인 경우: 인증 만료로 간주, 폴링 일시 정지하고 사용자 안내.
- 응답 HTML 구조가 바뀌어 파서가 0건을 반환하는 경우: 직전 스냅샷이 비어있지 않다면 "구조 변경 가능성" 플래그를 세우고 알림 발송 보류 (spec 06과 결합).
- service worker가 자주 종료되어도 alarm은 살아 있음 (Manifest V3 표준 동작).
- `chrome.alarms`의 최소 주기는 30초이지만 권장 1분 이상. 본 확장 기본값은 10분.

## 5. UI 변경

- 옵션 페이지에 `백그라운드 폴링` 섹션 추가
  - 활성 토글
  - 주기(분, 1~120, 기본 10)
  - 날짜 범위 모드: `오늘부터 N일` (N: 7, 14, 30, 90 중 선택, 기본 30)
  - 마지막 성공 시각, 마지막 실패 사유 표시
  - `지금 한 번 폴링` 버튼 (수동 트리거)

## 6. 데이터 모델

```ts
// chrome.storage.sync (사용자 설정)
type PollingSettings = {
  enabled: boolean;       // 기본 false (사용자가 명시적 활성화)
  intervalMinutes: number; // 기본 10
  rangeDays: number;       // 기본 30
};

// chrome.storage.local (런타임 상태)
type PollingState = {
  lastPolledAt: string | null;       // ISO datetime
  lastSuccessAt: string | null;
  lastError: { code: string; message: string; at: string } | null;
  consecutiveFailures: number;
  pausedReason: "auth-expired" | "structure-changed" | "max-retry" | null;
};

type LectureSnapshot = {
  takenAt: string;          // ISO datetime
  rangeStart: string;       // ISO date
  rangeEnd: string;         // ISO date
  lectures: Lecture[];      // parser 결과 (Spec 02·03 메타 포함)
};
```

## 7. 의존성

- 읽기: `PollingSettings`, 사용자의 swmaestro 세션 쿠키
- 쓰기: `lectureSnapshot`(local), `PollingState`(local)
- 호출:
  - `chrome.alarms.create`, `chrome.alarms.onAlarm`
  - `fetch(SWM 목록 URL)` (host_permissions 필요)
  - `parsers.parseLectureList(html)` 재사용
  - 실패 시 옵션 페이지·`chrome.notifications` 발송은 spec 07에 위임

## 8. 변경 / 신규 파일

- 수정: `manifest.json` (`permissions`에 `alarms` 추가), `src/background/service-worker.js` (alarm 핸들러 추가), `src/options/options.html`·`options.js` (폴링 섹션)
- 신규: `src/background/polling.js` (alarm 등록·fetch·파서 호출), `src/background/swm-fetch.js` (HTML fetch + 인증 만료 판정)
- 테스트: `tests/unit/polling.test.js` (Mock fetch·alarm), `tests/unit/swm-fetch.test.js`

## 9. 메시지 프로토콜

옵션 페이지 → service worker:

- `POLLING_TRIGGER_NOW`: 즉시 한 번 폴링
  - payload: 없음
  - response: `{ ok: boolean, error?: string, lectureCount?: number }`
- `POLLING_GET_STATE`: 현재 상태 조회
  - response: `{ settings: PollingSettings, state: PollingState }`
- `POLLING_UPDATE_SETTINGS`:
  - payload: `Partial<PollingSettings>`
  - response: `{ ok: boolean }`

내부 이벤트 (spec 06이 구독):

- `chrome.runtime` 메시지 broadcast 또는 직접 함수 호출. 본 spec에서는 함수 호출로(`onSnapshotUpdated(prev, next)`).

## 10. 테스트 케이스

- unit (`polling.test.js`)
  - alarm 등록·해제
  - 성공 경로: fetch 모킹 → snapshot 저장
  - 실패 경로: fetch 실패 시 `consecutiveFailures` 증가
  - backoff 스케줄
  - 인증 만료 응답 → `pausedReason` 세팅
- unit (`swm-fetch.test.js`)
  - 로그인 페이지 응답 감지(특정 DOM 마커)
  - 정상 응답에서 lecture 추출
- 수동
  - 옵션 페이지에서 활성화 → 10분 후 `lastSuccessAt` 갱신
  - 의도적으로 swmaestro 로그아웃 → 다음 alarm에서 정지·안내

## 11. 비기능 요구사항

- 권한 추가: `alarms` (manifest)
- 폴링은 사용자 명시 동의 후에만 시작. 기본 비활성.
- fetch 응답은 메모리에서만 처리, raw HTML은 저장하지 않음.
- 배터리·트래픽: 주기 10분 가정 시 일 144회. SWM 응답 평균 100KB라면 일 14MB. 사용자가 받아들일 만한 수준이지만 안내 문구로 명시.
- 네트워크 오프라인 감지(`navigator.onLine`)로 즉시 실패 처리.

## 12. 미해결 질문

- `@user` 폴링 활성 안내·동의 문구를 옵션 첫 진입 시 modal로 띄울지, 단순 토글로 둘지.
- `@user` 인증 만료 시 자동 재인증 시도(보이지 않는 SWM 로그인 redirect 추적)를 할지, 사용자 안내만 할지. 후자가 안전.
- `@tbd` content script가 페이지에서 직접 본 결과(=실시간)와 폴링 스냅샷(=주기적)이 충돌할 때 우선순위. 안에서 본 게 더 최신.

## 13. 관련 링크

- 코드: `src/content/parsers.js` 목록 파서, `src/background/service-worker.js`
- 외부: [chrome.alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- 관련 spec: **01 캘린더 뷰 (소비자, 본 spec의 직접 후속)**, 06 스냅샷·diff (소비자), 07 chrome notification, 08 알림 큐
