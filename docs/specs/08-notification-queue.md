# Spec 08: 알림 큐 + Chrome notification 발송

> Status: draft
> Branch: feature/08-notification-queue
> Phase: 2
> Depends on: 06 (이벤트 입력은 spec 09·10이 매칭 후 전달)
>
> **2026-04-29 갱신**: spec 07 폐기에 따라 본 spec이 `chrome.notifications.create()` 발송 책임까지 흡수. 큐와 OS 알림이 항상 함께 발생하므로 한 모듈로 통합. 권한 요청·옵션 토글도 본 spec으로 이관.

## 1. 목적

OS 알림은 사용자가 자리에 없거나 DND 상태이면 놓친다. **미확인 알림을 영구 큐로 보존**해 사용자가 자리에 돌아왔을 때 확인할 수 있게 한다. 큐는 옵션 페이지·확장 팝업·SWM 페이지 배너에서 동시에 접근 가능.

추가로 `chrome.notifications.create()` 발송도 본 모듈이 담당해 큐 enqueue와 OS 알림이 한 트랜잭션으로 일어나도록 한다.

## 2. 사용자 스토리

- as a 연수생, I want 자리 비운 동안 발생한 알림을 한 번에 확인하고, so that 놓친 자리 변동·신규 특강을 추격한다.
- as a 연수생, I want 본 알림은 큐에서 제거하고, so that 새로운 것만 남는다.
- as a 사용자, I want 큐가 무한히 쌓이지 않게 자동 정리되고, so that storage가 비대해지지 않는다.

## 3. 범위

### 포함
- spec 09·10 매처가 매칭 결과를 본 모듈에 넘기면, 큐 enqueue + `chrome.notifications.create()` 동시 호출
- 알림 카테고리 2종만 지원
  - `watched-lecture-new`: 신규 특강 알림 (spec 09)
  - `watched-seat-opened`: 자리 알림 (spec 10)
- 알림 클릭/버튼 핸들러 (상세 페이지 새 탭) — onClicked/onClosed 등록
- 알림 권한 요청 및 옵션 토글 UI
- 같은 ID 재발송 시 chrome 자동 갱신 (occurrences 카운트만 증가)
- 큐 영속화 (`chrome.storage.local`)
- "본 것"으로 표시 (마크 또는 삭제)
- 큐 조회 UI (옵션 페이지 + 확장 action 팝업 신규)
- 큐 자동 정리 정책 (보존 기간·최대 개수·만료된 특강 자동 제거)
- 확장 action 아이콘 뱃지에 미확인 개수 표시

### 제외
- 푸시 외부 채널(슬랙·이메일 등)로 위임
- 큐 항목별 공유 링크
- 시간/장소/카테고리/멘토 변경 알림 (spec 07 폐기로 제외)
- 정원 마감(`seat-closed`) 알림 — 노이즈 우려로 발송하지 않음 (2026-04-29 결정 U-10-1)
- 알림 사운드 커스터마이즈 (chrome 기본 사용)

## 4. 동작 시나리오

### Golden path
1. spec 09·10 매처가 `MatchedNotification`을 본 모듈의 `notify(item)`에 전달.
2. `notify`는 한 트랜잭션으로 (a) 큐 `enqueue` (b) `chrome.notifications.create` 호출.
3. 사용자가 자리에 없는 동안 큐에 N건 누적. action 아이콘에 빨간 뱃지 `N`.
4. 사용자가 돌아와 action 아이콘 클릭 → 팝업에 미확인 항목 리스트 (시간 역순). 각 항목에 `상세로 이동` `읽음 처리` 버튼.
5. `상세로 이동` 클릭 → 새 탭 + 자동으로 해당 항목 읽음.
6. `모두 읽음` 버튼으로 일괄 처리.
7. 옵션 페이지에서도 같은 큐를 더 큰 화면으로 볼 수 있음 (필터·검색).

### 엣지 케이스
- 같은 lecture에 같은 카테고리 알림이 반복 발생: 큐에는 최신 1개만 유지(상위 덮어쓰기). 변동 횟수는 메타에 기록.
- 큐 크기 상한(예: 200건) 초과 시 가장 오래된 읽지 않은 항목부터 제거.
- 만료된 특강(이미 끝난 시간): 24시간 후 자동 정리.
- 보존 기간(기본 3일) 지난 항목은 다음 폴링 사이클에 자동 제거 (2026-04-29 결정 U-08-2).
- service worker가 종료되어도 `chrome.storage.local`에 영속.
- chrome OS 알림 권한 미부여·정책 차단: `chrome.notifications.create`는 실패하지만 큐는 정상 enqueue → 옵션 페이지에서 `권한 요청` 안내.
- 알림 발송 직후 chrome이 자동 갱신(같은 ID): 큐의 `occurrences` 증가, OS 알림은 갱신 표시.

## 5. UI 변경

- 신규: 확장 action 팝업 (`src/popup/popup.html`/`popup.js`)
- 수정: 옵션 페이지에 `미확인 알림` 섹션 또는 별도 페이지
- 옵션 페이지 `알림` 섹션 (spec 07에서 이관)
  - 카테고리 토글 2종 (`watched-lecture-new` ON 기본 / `watched-seat-opened` ON 기본)
  - 알림 권한 상태 표시 + `권한 요청` 버튼
- action badge: `chrome.action.setBadgeText`로 미확인 개수 표시
- mock: 확장 팝업의 mock 데이터로 디자인 확인

## 6. 데이터 모델

```ts
type NotificationCategory =
  | "watched-lecture-new"   // 신규 특강 알림 (spec 09)
  | "watched-seat-opened";  // 자리 알림 (spec 10)

type MatchedNotification = {
  id: string;                      // 알림 ID. 보통 `${category}:${qustnrSn}` (신규 특강 그룹화 시 spec 09 참조)
  category: NotificationCategory;
  qustnrSn: string;                // 그룹화된 신규 특강의 경우 대표 qustnrSn
  title: string;                   // OS 알림 제목
  message: string;                 // OS 알림 본문
  detailUrl: string;
  event: LectureChangeEvent;       // 원본 이벤트
  createdAt: string;
};

type NotificationQueueItem = MatchedNotification & {
  updatedAt: string;               // 같은 ID 재발생 시 갱신
  occurrences: number;             // 누적 횟수
  read: boolean;                   // 사용자 확인 여부
  readAt?: string;
};

// chrome.storage.local
type NotificationQueueState = {
  items: NotificationQueueItem[];  // 시간 역순 가정
  unreadCount: number;             // 빠른 뱃지 갱신용 캐시
};

// chrome.storage.sync
type NotificationSettings = {
  categories: Record<NotificationCategory, boolean>; // 둘 다 기본 true
  retentionDays: number;            // 기본 3 (2026-04-29 결정)
};
```

## 7. 의존성

- 읽기: 큐 state, `NotificationSettings`, lecture 종료 시각, 알림 권한 상태
- 쓰기: 큐 state, action badge, `NotificationSettings`
- 호출: `chrome.notifications.create/onClicked/onClosed`, `chrome.action.setBadgeText/BackgroundColor`, `chrome.tabs.create`

## 8. 변경 / 신규 파일

- 수정: `manifest.json` (`permissions`에 `notifications` 추가, `action.default_popup` 추가), `src/background/service-worker.js`, `src/options/options.html`·`options.js`
- 신규: `src/background/notification-queue.js` (큐 + chrome.notifications wrapper 통합), `src/popup/popup.html`, `src/popup/popup.js`, `src/popup/popup.css`, `icons/notification-*.png` (필요 시)
- 테스트: `tests/unit/notification-queue.test.js` (큐 동작 + chrome.notifications 모킹)

## 9. 메시지 프로토콜

옵션·팝업 → service worker:

- `QUEUE_GET`:
  - payload: `{ filter?: { categories?: NotificationCategory[]; unreadOnly?: boolean } }`
  - response: `{ items: NotificationQueueItem[]; unreadCount: number }`
- `QUEUE_MARK_READ`:
  - payload: `{ ids: string[] }`
  - response: `{ ok: boolean; unreadCount: number }`
- `QUEUE_MARK_ALL_READ`:
  - response: `{ ok: boolean }`
- `QUEUE_DELETE`:
  - payload: `{ ids: string[] }`
  - response: `{ ok: boolean }`
- `QUEUE_CLEAR`:
  - response: `{ ok: boolean }`
- `NOTIF_REQUEST_PERMISSION`:
  - response: `{ granted: boolean }`
- `NOTIF_GET_SETTINGS` / `NOTIF_UPDATE_SETTINGS`:
  - 카테고리 토글·보존 기간

내부 함수:

- `notify(item: MatchedNotification): Promise<void>` — 큐 enqueue + `chrome.notifications.create`. spec 09·10 매처가 호출.
- `enqueue(item: MatchedNotification): NotificationQueueItem` (단독 호출도 가능, 알림 권한 없을 때 큐만 채움)
- `compactExpired(now: Date): number` (정리된 개수 반환, 보존 기간·만료 시각 모두 검사)

## 10. 테스트 케이스

- unit (`notification-queue.test.js`, chrome.notifications 모킹)
  - `notify` 호출 시 enqueue + chrome.notifications.create 동시 발생
  - 카테고리 OFF 시 enqueue도 chrome.notifications도 호출 안 됨
  - 같은 ID 재호출 → occurrences 증가, chrome.notifications는 갱신
  - 권한 미부여 시 chrome.notifications는 실패하나 큐 enqueue는 성공
  - markRead → unreadCount 감소
  - 보존 기간(3일) 지난 항목 `compactExpired`로 제거
  - 보존 한도 초과 시 오래된 항목부터 제거
  - 만료된 특강(`endAt` 지난) 정리
  - onClicked 핸들러가 `chrome.tabs.create` 호출 + read 처리
- DOM (popup)
  - 항목 클릭 → 새 탭 + read 처리
  - 뱃지 텍스트 갱신
- 수동
  - 알림 발송 후 팝업에서 확인 → 뱃지 0
  - 자리 비우기 시뮬레이션 (같은 알림 ID 5회) → 1건만 보임
  - 옵션에서 카테고리 토글 → 다음 폴링부터 반영

## 11. 비기능 요구사항

- 큐 크기 상한 200건. 한 항목 평균 1KB 가정 → 200KB. `chrome.storage.local`은 5MB로 충분.
- 정리 작업은 alarm fire 직후 실행(spec 05의 폴링 사이클에 piggyback).
- 옵션 페이지에서 `큐 비우기` 명시 버튼 제공.
- 권한: `notifications` 추가.
- 알림 본문은 lecture 정보만, 외부 데이터 노출 없음.

## 12. 미해결 질문

- ✅ **U-08-1 결정 (2026-04-30)**: 1차 출시는 `상세로 이동` + `읽음` **2버튼만** 유지. Chrome notification 최대 2버튼 한도 + YAGNI. 사용 후 패턴 데이터로 `Calendar 추가` 등 확장 검토.
- `@tbd` T-08: Windows 포커스 어시스트·DND 안내 문구 / 자리 알림과 신규 특강 알림 시각적 묶음 (팝업·옵션 UI 작성 시).
- `@tbd` 신규 특강 그룹화(spec 09)와 자리 알림이 같은 lecture에 동시 발생 시 시각적으로 묶을지.
- `@tbd` Windows 포커스 어시스트·DND 모드에서 알림이 silent로 처리되는 경우 사용자 안내.

## 13. 관련 링크

- 외부: [chrome.action](https://developer.chrome.com/docs/extensions/reference/api/action), [chrome.notifications](https://developer.chrome.com/docs/extensions/reference/api/notifications)
- 관련 spec: 06, 09, 10
- 폐기: spec 07 (본 spec이 알림 발송 책임 흡수)
