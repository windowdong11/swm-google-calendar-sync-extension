# Spec 09: 신규 특강 알림 + 멘토 별표 필터

> Status: draft
> Branch: feature/09-mentor-watchlist
> Phase: 3
> Depends on: 03 (mentorKey 정규화), 06 (lecture-added 이벤트), 08 (알림 큐 + chrome.notifications 발송)
>
> **2026-04-29 의미 전환**: "별표 멘토의 신규 특강만 알림"에서 "**모든 신규 특강 알림 + 별표 멘토 필터 UI**"로 정책 변경. 알림 자체는 전역으로 발송되며, 사용자는 별표한 멘토 기준으로 큐·옵션 페이지에서 필터링한다. 동일 제목 특강은 한 알림에 시간만 다중 표기로 묶음.

## 1. 목적

새 특강이 등록되는 즉시 사용자에게 알림. 별표한 멘토는 알림을 차단·발송 결정에 사용하지 않고, **사용자가 큐·옵션 페이지에서 본인이 관심 있는 멘토만 필터링해서 보는 보조 도구**로 사용.

## 2. 사용자 스토리

- as a 연수생, I want 새 특강이 올라오면 즉시 알림을 받고, so that 신청 기회를 빠르게 확보한다.
- as a 연수생, I want 동일 제목으로 시간만 다른 회차가 한꺼번에 올라오면 알림이 폭주하지 않고 한 건으로 묶이고, so that 노이즈가 줄어든다.
- as a 연수생, I want 관심 있는 멘토를 별표로 등록하고 큐에서 그 멘토의 특강만 필터링해 보고, so that 관심 영역에 빠르게 집중한다.
- as a 연수생, I want 별표 멘토 목록을 한눈에 보고 빠르게 추가·해제하고, so that 관심사가 변할 때 부담 없이 관리한다.

## 3. 범위

### 포함
- 매처: `lecture-added` 이벤트마다 `MatchedNotification(category="watched-lecture-new")` 발행 → spec 08의 `notify` 호출. **watchlist 필터링 없음** (전역 발송)
- 동일 제목 그룹화: 같은 폴링 사이클에 동일 `title` (정규화 후 일치)으로 들어온 신규 특강 N건은 **한 알림 ID로 묶고** 본문에 시간 목록을 다중 표기. 그룹 키는 `${mentorKey}|${normalizedTitle}` 형식, 알림 ID는 `watched-lecture-new:${groupKey}`
- 목록 페이지·상세 페이지의 멘토 칩 옆 별표(★) 토글 (즐겨찾기, 알림 게이트가 아님)
- 옵션 페이지: 관심 멘토 목록(`watchedMentors`) + 큐 필터 칩 `별표 멘토만`
- 팝업 상단 필터 토글: `별표 멘토만` 켜면 큐를 `watchedMentors` 기준으로 필터링

### 제외
- 멘토별 알림 카테고리 세분화 (2026-04-29 결정 U-09-2)
- 멘토 추천(자동 제안)
- 별표 멘토만 알림 받기 같은 게이트 동작 (이번 버전은 항상 전역 발송)

## 4. 동작 시나리오

### Golden path
1. 폴링 사이클에서 spec 06이 `lecture-added` N건 발행.
2. 매처가 같은 그룹 키(`mentorKey|normalizedTitle`)로 묶어 그룹별 1건의 `MatchedNotification` 생성. 본문에 시간 목록(예: `10/20 14:00, 10/22 15:00`).
3. spec 08의 `notify` 호출 → 큐 enqueue + OS 알림 발송.
4. 사용자가 별표한 멘토만 보고 싶으면 팝업 상단의 `별표 멘토만` 필터 ON.

### 엣지 케이스
- 동일 제목이지만 멘토가 다른 경우: 그룹 키가 다르므로 별개 알림. 멘토 변형으로 mentorKey 달라진 경우 spec 03 정규화 별칭으로 합쳐짐.
- 같은 그룹 키로 한 폴링에 1건만: 본문에 시간 1개만 표기.
- 같은 그룹 키로 다음 폴링에서 새 회차 추가: 알림 ID 동일이라 chrome.notifications 갱신, 큐의 `occurrences` 증가.
- 정규화한 제목이 매우 짧거나 빈 문자열: 그룹화하지 않고 `qustnrSn` 단위로 별도 알림 (오그룹화 방지).
- 별표 멘토 목록이 비어 있어도 매처는 정상 동작 (전역 발송이므로). `별표 멘토만` 필터 UI는 빈 상태 안내 표시.

## 5. UI 변경

- 목록·상세 페이지: 멘토 칩 옆 ★ 토글, 등록 시 채움/해제 시 빈 별 (즐겨찾기 의미)
- 팝업 상단: `별표 멘토만` 토글 칩
- 옵션 페이지:
  - `관심 멘토` 섹션 (mentorKey + 표시명 + 메모 + 등록일 + 해제 버튼)
  - 큐 뷰에 `별표 멘토만` 필터 칩 (팝업과 공유)
- 알림 본문 형식
  - 단일: `[새 특강] <멘토> — <제목> @ 10/20 14:00`
  - 그룹: `[새 특강] <멘토> — <제목> 3건` / contextMessage `10/20 14:00, 10/22 15:00, 10/24 16:00`

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
  newLectureFilter?: { starredOnly: boolean }; // 팝업 필터 상태 보존
};

// 그룹화 키 산출
function groupKey(lecture: Lecture): string {
  const normalizedTitle = lecture.title.trim().replace(/\s+/g, " ");
  return `${lecture.mentorKey ?? "unknown"}|${normalizedTitle}`;
}
```

## 7. 의존성

- 읽기: lecture 메타(`mentorKey`, `mentorName`, `title`, `startAt`), `watchedMentors`, `newLectureFilter`, `lecture-added` 이벤트 배열
- 쓰기: `watchedMentors`, `newLectureFilter`
- 호출: spec 08의 `notify(MatchedNotification)` (그룹별 1회)

## 8. 변경 / 신규 파일

- 수정: `src/content/content.js`·`apply.js` (별표 토글 UI), `src/options/options.html`·`options.js` (관심 멘토 섹션 + 큐 필터), `src/popup/popup.html`·`popup.js` (필터 칩), `src/background/service-worker.js`
- 신규: `src/background/new-lecture-notifier.js` (added 이벤트 → 그룹화 → notify), 별표 컴포넌트 (`src/content/star-toggle.js` 또는 인라인)
- 테스트: `tests/unit/new-lecture-notifier.test.js`

## 9. 메시지 프로토콜

- `WATCH_MENTOR_ADD`:
  - payload: `{ mentorKey: string; displayName: string; memo?: string }`
  - response: `{ ok: boolean; watchedMentors: WatchedMentor[] }`
- `WATCH_MENTOR_REMOVE`:
  - payload: `{ mentorKey: string }`
  - response: `{ ok: boolean; watchedMentors: WatchedMentor[] }`
- `WATCH_MENTOR_LIST`:
  - response: `{ watchedMentors: WatchedMentor[] }`
- `NEW_LECTURE_FILTER_SET`:
  - payload: `{ starredOnly: boolean }`
  - response: `{ ok: boolean }`

## 10. 테스트 케이스

- unit (`new-lecture-notifier.test.js`)
  - `lecture-added` 1건 → notify 1회 호출 (단일 시간 표기)
  - 같은 mentorKey + 동일 정규화 제목 N건 → 그룹화되어 notify 1회 (시간 다중 표기)
  - 다른 멘토·다른 제목 → 그룹 분리, notify 별도 호출
  - 빈/짧은 제목 → 그룹화 비활성, qustnrSn 단위 별도
  - 같은 그룹 키로 다음 폴링에 새 회차 → 같은 알림 ID로 갱신, occurrences 증가
  - watchedMentors 비어 있어도 notify 호출됨 (전역 발송 검증)
- DOM
  - ★ 클릭 시 `WATCH_MENTOR_ADD` 발송, 칩 색 변경
  - 옵션 페이지 추가·삭제
  - 팝업 `별표 멘토만` 토글 → 큐 필터링

## 11. 비기능 요구사항

- 권한 추가 없음(spec 05·08에서 처리됨).
- watchlist 50명 cap. 초과 시 추가 거부 + 메시지.
- 그룹화는 한 폴링 사이클의 added 이벤트 배열 단위로만 수행 (이전 사이클 결과와 합치지 않음).
- 알림 폭주 방지: 한 사이클당 그룹 알림 30건 cap, 초과 시 합산 메시지 1건으로 묶음.

## 12. 미해결 질문

- `@user` 별표 토글을 목록의 멘토 칩 옆에만 둘지, 멘토 그룹 헤더(spec 03)에도 둘지. (묶음 B U-09-1)
- `@tbd` 제목 정규화 알고리즘 (공백·괄호·회차번호 제거 정도)

## 13. 관련 링크

- 관련 spec: 03 mentor 분류, 06, 08
- 폐기: spec 07
