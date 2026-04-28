# Spec 07: Chrome notification 통합 (폐기)

> Status: deprecated (2026-04-29)
> Branch: feature/07-chrome-notifications (생성하지 않음)
> Phase: 2
> Depends on: 06 (이벤트 입력)

## 폐기 사유

2026-04-29 사용자 결정: 시간/장소/메타 변경 알림 기능 자체 제거. 알림 카테고리는 두 종류만 남음.

- 신규 특강 알림 → spec 09에서 처리
- 자리 알림 → spec 10에서 처리

`chrome.notifications.create()` 호출은 spec 08(알림 큐)이 enqueue 시점에 함께 책임진다(큐와 알림이 항상 같이 발생하므로 통합). 권한·옵션 토글도 spec 08로 이관.

본 문서는 결정 이력 추적을 위해 보존하나 더 이상 진입하지 않는다. README의 Phase 인덱스에서 deprecated 표시. 후임 결정이 바뀌면 본 spec을 다시 살리지 말고 새 번호로 재발행.

이하 본문은 폐기 시점의 초안이며 더 이상 유효하지 않다.

---


## 1. 목적

`chrome.notifications` API로 OS 레벨 알림을 띄운다. Phase 3의 관심 멘토·관심 특강 트리거가 발화한 변경 이벤트를 사용자가 즉시 인지하게 한다.

## 2. 사용자 스토리

- as a 연수생, I want 자리가 났을 때 OS 알림으로 즉시 알고, so that 다른 사람이 채우기 전에 신청한다.
- as a 연수생, I want 알림에서 바로 상세 페이지로 이동하고, so that 신청까지 1~2클릭이면 끝난다.
- as a 사용자, I want 알림 카테고리별 ON/OFF를 제어하고, so that 너무 많은 알림으로 피로해지지 않는다.

## 3. 범위

### 포함
- `chrome.notifications.create()` 래퍼 (`notifyLectureEvent`)
- 이벤트 → 알림 메시지 매핑 (제목·본문·아이콘·버튼)
- 알림 클릭/버튼 핸들러 (상세 페이지 새 탭)
- 알림 발송 정책 (어떤 이벤트가 알림 가치 있나) — Phase 3의 관심 매칭 결과만 발송
- 알림 카테고리별 옵션 (관심 특강 자리 / 관심 멘토 신규 / 일반 변동 — 기본 OFF)
- 알림 ID와 lecture qustnrSn·이벤트 ID 매핑 (큐 spec 08과 공유)
- 동일 이벤트 재발송 방지(같은 알림 ID 사용 시 chrome이 자동 갱신)

### 제외
- 알림 그룹화·요약(`@tbd` 다음 phase)
- 사운드 커스터마이즈 (chrome 알림 기본 사용)
- 미확인 알림 큐 자체는 spec 08

## 4. 동작 시나리오

### Golden path
1. spec 06이 `LectureChangeEvent` 배열 publish.
2. spec 09·10의 관심 매처가 이벤트를 사용자 관심과 매칭 → `MatchedNotification` 배열로 변환 → 본 모듈에 전달.
3. 각 알림에 대해 `chrome.notifications.create()`. 동시에 spec 08의 큐에도 enqueue.
4. 사용자가 알림 클릭 → `chrome.notifications.onClicked`에서 상세 URL 새 탭으로.
5. 알림 닫힘 (`onClosed`) → 큐에서 "본 것"으로 표시(byUser=true일 때만).

### 엣지 케이스
- chrome OS 알림이 비활성·정책으로 차단 → API는 성공처럼 보이지만 표시되지 않음. 큐 spec 08에 의존해 사용자가 나중에 볼 수 있게 함.
- 짧은 시간에 같은 lecture에 대해 여러 변동 → 같은 알림 ID로 갱신만(노이즈 방지). 단, "자리 났음 → 자리 마감" 같은 상태 반전은 별도 알림 ID.
- 알림 발송 실패 (예: 권한 미부여): 큐에는 그대로 남고, 옵션 페이지에 권한 요청 안내.

## 5. UI 변경

- 옵션 페이지에 `알림` 섹션
  - 알림 카테고리별 토글 (`관심 특강 자리`, `관심 멘토 신규 특강`, `시간/장소 변경`, `메타 변경` 등)
  - 알림 권한 상태 표시 + `권한 요청` 버튼
  - 미확인 큐 진입 버튼 (spec 08)

## 6. 데이터 모델

```ts
type NotificationCategory =
  | "watched-seat-opened"   // 관심 특강 자리 (spec 10)
  | "watched-mentor-new"    // 관심 멘토 신규 특강 (spec 09)
  | "time-changed"
  | "place-changed"
  | "meta-changed";

type MatchedNotification = {
  id: string;                  // 알림 ID. 보통 `${category}:${qustnrSn}:${at}`
  category: NotificationCategory;
  title: string;
  message: string;
  contextMessage?: string;     // 보조 줄
  iconUrl?: string;
  qustnrSn: string;
  detailUrl: string;
  event: LectureChangeEvent;   // 원본 이벤트 (큐가 사용)
  createdAt: string;
};

// chrome.storage.sync
type NotificationSettings = {
  categories: Record<NotificationCategory, boolean>; // 기본 watched-* 만 true
  soundEnabled?: boolean; // chrome 기본 사용 (옵션 보류)
};
```

## 7. 의존성

- 읽기: `NotificationSettings`, 권한 상태
- 쓰기: spec 08 큐에 enqueue
- 호출: `chrome.notifications.create/onClicked/onClosed`, `chrome.tabs.create`

## 8. 변경 / 신규 파일

- 수정: `manifest.json` (`permissions`에 `notifications` 추가), `src/background/service-worker.js` (콜백 등록), `src/options/options.html`·`options.js`
- 신규: `src/background/notifier.js` (이벤트 → MatchedNotification 변환·발송), `icons/notification-*.png` (필요 시)
- 테스트: `tests/unit/notifier.test.js` (chrome.notifications 모킹)

## 9. 메시지 프로토콜

옵션 페이지 → service worker:

- `NOTIF_REQUEST_PERMISSION`:
  - response: `{ granted: boolean }`
- `NOTIF_GET_SETTINGS` / `NOTIF_UPDATE_SETTINGS`:
  - 기존 `GET_SETTINGS` 패턴 따라 분리하거나 통합 가능. 본 spec에선 분리 유지.

내부:

- `notifier.publish(notifications: MatchedNotification[])` — spec 09·10 매처가 호출

## 10. 테스트 케이스

- unit (`notifier.test.js`)
  - 카테고리 OFF 시 발송 안 됨
  - 같은 ID 재발송 시 update만
  - onClicked 핸들러가 새 탭 여는지 (chrome.tabs.create mock)
  - 상태 반전 케이스 → 별도 알림 ID
- 수동
  - 옵션에서 카테고리 토글 → 다음 폴링부터 반영
  - 알림 클릭 → 상세 페이지 열림

## 11. 비기능 요구사항

- 권한 추가: `notifications`
- 알림 본문은 lecture 정보만, 외부 데이터 노출 없음
- 알림 폭주 방지: spec 09·10 매처가 사용자 관심 매칭한 것만 본 모듈에 전달

## 12. 미해결 질문

- `@user` `time-changed`·`place-changed`·`meta-changed`는 본인이 신청한 특강에 한해 발송할지, 모든 lecture에 발송할지. 기본은 신청한 특강만.
- `@user` 알림 본문에 신청 가능 잔여석 수치를 표시할지(자리 알림 한정).
- `@tbd` Windows 포커스 어시스트·DND 모드에서 알림이 silent로 처리되는 경우 사용자 안내.

## 13. 관련 링크

- 외부: [chrome.notifications](https://developer.chrome.com/docs/extensions/reference/api/notifications)
- 관련 spec: 06, 08, 09, 10
