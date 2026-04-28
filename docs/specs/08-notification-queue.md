# Spec 08: 알림 큐 (미확인 알림 보존)

> Status: draft
> Branch: feature/08-notification-queue
> Phase: 2
> Depends on: 07 (알림 발송이 큐에 동시 기록)

## 1. 목적

OS 알림은 사용자가 자리에 없거나 DND 상태이면 놓친다. **미확인 알림을 영구 큐로 보존**해 사용자가 자리에 돌아왔을 때 확인할 수 있게 한다. 큐는 옵션 페이지·확장 팝업·SWM 페이지 배너에서 동시에 접근 가능.

## 2. 사용자 스토리

- as a 연수생, I want 자리 비운 동안 발생한 알림을 한 번에 확인하고, so that 놓친 자리 변동·신규 특강을 추격한다.
- as a 연수생, I want 본 알림은 큐에서 제거하고, so that 새로운 것만 남는다.
- as a 사용자, I want 큐가 무한히 쌓이지 않게 자동 정리되고, so that storage가 비대해지지 않는다.

## 3. 범위

### 포함
- spec 07이 발송한 알림을 큐에 enqueue
- 큐 영속화 (`chrome.storage.local`)
- "본 것"으로 표시 (마크 또는 삭제)
- 큐 조회 UI (옵션 페이지 + 확장 action 팝업 신규)
- 큐 자동 정리 정책 (보존 기간·최대 개수·만료된 특강 자동 제거)
- 확장 action 아이콘 뱃지에 미확인 개수 표시

### 제외
- 푸시 외부 채널(슬랙·이메일 등)로 위임
- 큐 항목별 공유 링크

## 4. 동작 시나리오

### Golden path
1. spec 07이 발송 시 동시에 큐에 `enqueue(item)` 호출.
2. 사용자가 자리에 없는 동안 큐에 N건 누적. action 아이콘에 빨간 뱃지 `N`.
3. 사용자가 돌아와 action 아이콘 클릭 → 팝업에 미확인 항목 리스트 (시간 역순). 각 항목에 `상세로 이동` `읽음 처리` 버튼.
4. `상세로 이동` 클릭 → 새 탭 + 자동으로 해당 항목 읽음.
5. `모두 읽음` 버튼으로 일괄 처리.
6. 옵션 페이지에서도 같은 큐를 더 큰 화면으로 볼 수 있음 (필터·검색).

### 엣지 케이스
- 같은 lecture에 같은 카테고리 알림이 반복 발생: 큐에는 최신 1개만 유지(상위 덮어쓰기). 변동 횟수는 메타에 기록.
- 큐 크기 상한(예: 200건) 초과 시 가장 오래된 읽지 않은 항목부터 제거.
- 만료된 특강(이미 끝난 시간): 24시간 후 자동 정리.
- service worker가 종료되어도 `chrome.storage.local`에 영속.

## 5. UI 변경

- 신규: 확장 action 팝업 (`src/popup/popup.html`/`popup.js`)
- 수정: 옵션 페이지에 `미확인 알림` 섹션 또는 별도 페이지
- action badge: `chrome.action.setBadgeText`로 미확인 개수 표시
- mock: 확장 팝업의 mock 데이터로 디자인 확인

## 6. 데이터 모델

```ts
type NotificationQueueItem = {
  id: string;                      // spec 07의 알림 ID와 동일
  category: NotificationCategory;
  qustnrSn: string;
  title: string;                   // lecture 제목
  message: string;                 // 알림 본문
  detailUrl: string;
  createdAt: string;               // 첫 발생
  updatedAt: string;               // 같은 ID 재발생 시 갱신
  occurrences: number;             // 누적 횟수
  read: boolean;                   // 사용자 확인 여부
  readAt?: string;
  event: LectureChangeEvent;       // 원본 이벤트
};

// chrome.storage.local
type NotificationQueueState = {
  items: NotificationQueueItem[];  // 시간 역순 가정
  unreadCount: number;             // 빠른 뱃지 갱신용 캐시
};
```

## 7. 의존성

- 읽기: 큐 state, lecture 종료 시각
- 쓰기: 큐 state, action badge
- 호출: `chrome.action.setBadgeText/BackgroundColor`, `chrome.tabs.create`

## 8. 변경 / 신규 파일

- 수정: `manifest.json` (`action.default_popup` 추가), `src/background/service-worker.js`
- 신규: `src/background/notification-queue.js`, `src/popup/popup.html`, `src/popup/popup.js`, `src/popup/popup.css`
- 옵션 페이지에도 큐 뷰 신규: `src/options/options.html`·`options.js` 확장
- 테스트: `tests/unit/notification-queue.test.js`

## 9. 메시지 프로토콜

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

내부 함수:

- `enqueue(item: NotificationQueueItem): void`
- `compactExpired(now: Date): number` (정리된 개수 반환)

## 10. 테스트 케이스

- unit (`notification-queue.test.js`)
  - enqueue 후 unreadCount 증가
  - 같은 ID 재enqueue → occurrences 증가, item 1건 유지
  - markRead → unreadCount 감소
  - 보존 한도 초과 시 오래된 항목부터 제거
  - 만료 정리(`compactExpired`)
- DOM (popup)
  - 항목 클릭 → `chrome.tabs.create` 호출 + read 처리
  - 뱃지 텍스트 갱신
- 수동
  - 알림 발송 후 팝업에서 확인 → 뱃지 0
  - 자리 비우기 시뮬레이션 (같은 알림 ID 5회 enqueue) → 1건만 보임

## 11. 비기능 요구사항

- 큐 크기 상한 200건. 한 항목 평균 1KB 가정 → 200KB. `chrome.storage.local`은 5MB로 충분.
- 정리 작업은 alarm fire 직후 실행(spec 05의 폴링 사이클에 piggyback).
- 옵션 페이지에서 `큐 비우기` 명시 버튼 제공.

## 12. 미해결 질문

- `@user` 큐 항목에 액션 버튼(`Google Calendar에 추가` 등) 추가할지. 현재 spec은 `상세로 이동` `읽음`만.
- `@user` 보존 기간 기본값(24h vs 7일).
- `@tbd` 같은 lecture에 대한 다른 카테고리 알림(자리 알림 + 시간 변경)이 동시 발생 시 시각적으로 묶을지.

## 13. 관련 링크

- 외부: [chrome.action](https://developer.chrome.com/docs/extensions/reference/api/action)
- 관련 spec: 06, 07, 09, 10
