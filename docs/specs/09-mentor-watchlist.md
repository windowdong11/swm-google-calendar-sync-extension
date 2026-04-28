# Spec 09: 관심 멘토 등록·신규 특강 알림

> Status: draft
> Branch: feature/09-mentor-watchlist
> Phase: 3
> Depends on: 03 (mentorKey 정규화), 06 (lecture-added 이벤트), 07 (알림), 08 (큐)

## 1. 목적

특정 멘토의 새 특강이 올라오면 즉시 알림. 멘토 단위로 관심 등록해 두고, 폴링 주기마다 신규 특강 등록을 감지해 알린다.

## 2. 사용자 스토리

- as a 연수생, I want 관심 멘토(예: 평소 도움받고 싶은 분)를 등록하고, so that 그 분의 새 특강이 열리면 바로 안다.
- as a 연수생, I want 관심 멘토 목록을 한눈에 보고 빠르게 추가·해제하고, so that 관심사가 변할 때 부담 없이 관리한다.

## 3. 범위

### 포함
- 목록 페이지·상세 페이지의 멘토 칩 옆 별표(★) 토글
- 옵션 페이지에 관심 멘토 관리 섹션
- 매처: `lecture-added` 이벤트의 `mentorKey`가 watchlist에 있으면 `MatchedNotification(category="watched-mentor-new")` 발행
- 큐·알림과 통합

### 제외
- 멘토별 알림 카테고리 세분화(시간/장소 변경까지 모두 알림)
- 멘토 추천(자동 제안)

## 4. 동작 시나리오

### Golden path
1. 사용자가 목록 페이지에서 멘토 칩의 ★를 클릭 → 관심 멘토 추가.
2. 다음 폴링에서 해당 멘토의 신규 특강이 등장 → spec 06이 `lecture-added` 발행 → 매처가 watchlist 비교 → 매칭 → spec 07로 알림, spec 08로 큐.
3. 옵션 페이지에서 관심 멘토 목록 확인·해제·메모 추가.

### 엣지 케이스
- 멘토명 변형으로 mentorKey가 달라진 경우: spec 03의 정규화 별칭으로 처리. 이걸 해도 매칭이 안 되면 사용자가 새 키를 ★해야 함.
- 같은 멘토의 같은 특강이 짧은 시간에 사라졌다 다시 등장(SWM 재공개): 동일 qustnrSn이면 알림 ID 동일 → 갱신만.
- watchlist가 비어있으면 매처 자체를 skip.

## 5. UI 변경

- 목록·상세 페이지: 멘토 칩 옆 ★ 토글, 등록 시 채움/해제 시 빈 별
- 옵션 페이지: `관심 멘토` 섹션 (mentorKey + 표시명 + 메모 + 등록일 + 해제 버튼)
- 큐 항목: `[관심 멘토] 홍길동 멘토의 새 특강: <제목>` 식의 본문

## 6. 데이터 모델

```ts
type WatchedMentor = {
  mentorKey: string;       // spec 03 정규화 키
  displayName: string;     // 사용자에게 보여줄 원문
  memo?: string;
  addedAt: string;
};

// chrome.storage.sync (디바이스 간 동기화 가치 있음)
type Settings = {
  // ...
  watchedMentors: WatchedMentor[];
};
```

## 7. 의존성

- 읽기: lecture 메타(`mentorKey`, `mentorName`), `watchedMentors`, `lecture-added` 이벤트
- 쓰기: `watchedMentors`
- 호출: spec 07의 `notifier.publish`, spec 08의 `enqueue`

## 8. 변경 / 신규 파일

- 수정: `src/content/content.js`·`apply.js` (별표 토글 UI), `src/options/options.html`·`options.js` (관심 멘토 섹션), `src/background/service-worker.js`
- 신규: `src/background/mentor-watch.js` (매처), 별표 컴포넌트 (`src/content/star-toggle.js` 또는 인라인)
- 테스트: `tests/unit/mentor-watch.test.js`

## 9. 메시지 프로토콜

- `WATCH_MENTOR_ADD`:
  - payload: `{ mentorKey: string; displayName: string; memo?: string }`
  - response: `{ ok: boolean; watchedMentors: WatchedMentor[] }`
- `WATCH_MENTOR_REMOVE`:
  - payload: `{ mentorKey: string }`
  - response: `{ ok: boolean; watchedMentors: WatchedMentor[] }`
- `WATCH_MENTOR_LIST`:
  - response: `{ watchedMentors: WatchedMentor[] }`

## 10. 테스트 케이스

- unit (`mentor-watch.test.js`)
  - 매칭: watchlist에 있는 mentorKey의 added 이벤트 → 알림 1건
  - 매칭 없음: 알림 발행 안 됨
  - 다중 매칭: 한 폴링에 여러 신규
  - 같은 qustnrSn 재등장 → 같은 알림 ID
- DOM
  - ★ 클릭 시 메시지 발송, 칩 색 변경
  - 옵션 페이지 추가·삭제

## 11. 비기능 요구사항

- 권한 추가 없음(spec 05·07·08에서 처리됨).
- watchlist 50명 cap. 초과 시 추가 거부 + 메시지.

## 12. 미해결 질문

- `@user` 별표 토글을 목록의 멘토 칩 옆에만 둘지, 멘토 그룹 헤더(spec 03)에도 둘지.
- `@user` 멘토 단위로 알림 카테고리 세분화(예: `이 멘토는 시간 변경도 알림`) 옵션 필요한가.

## 13. 관련 링크

- 관련 spec: 03 mentor 분류, 06, 07, 08
