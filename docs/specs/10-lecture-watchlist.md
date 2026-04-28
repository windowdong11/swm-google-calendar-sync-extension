# Spec 10: 관심 특강 등록·자리 알림

> Status: draft
> Branch: feature/10-lecture-watchlist
> Phase: 3
> Depends on: 06 (seat-opened/closed 이벤트), 07 (알림), 08 (큐)

## 1. 목적

신청하고 싶었지만 만석이라 신청하지 못한 특강에 **관심 등록**해 두고, 자리가 나면 즉시 알림. 핵심 user value.

## 2. 사용자 스토리

- as a 연수생, I want 관심 특강을 등록해 두고 자리 알림을 받고, so that 누가 취소했을 때 즉시 신청한다.
- as a 연수생, I want 자리가 났다 다시 닫혀도 큐에서 흐름을 보고, so that 패턴을 파악한다.
- as a 사용자, I want 신청 완료된 특강은 자동으로 watchlist에서 빠지고, so that 불필요한 알림을 안 받는다.

## 3. 범위

### 포함
- 목록·상세 페이지에 `관심 등록` 버튼/별표 (만석 또는 일반 상태 모두에서)
- 옵션 페이지에 관심 특강 관리 섹션
- 매처: `seat-opened` 이벤트의 `qustnrSn`이 watchlist에 있으면 알림 발행 (`watched-seat-opened` 카테고리)
- 신청 완료 시 자동 제거 (`UPSERT_SOURCE_LECTURE` 성공 핸들러에 hook)
- 특강 종료 시각 지나면 자동 제거
- 큐·알림 통합

### 제외
- 자리 알림 외 시간/장소 변경 알림(이건 spec 07에서 본인 신청 특강에 한해 발송)
- 자동 신청(SWM 신청 API 자동 호출) — 위험·정책 이슈로 명시 제외

## 4. 동작 시나리오

### Golden path
1. 사용자가 만석인 특강 행을 보고 `관심 등록` 클릭 → watchlist 추가.
2. 폴링 중 누군가 취소 → spec 06이 `seat-opened` 발행 → 매처가 매칭 → 알림 + 큐.
3. 사용자가 알림 클릭 → 상세 페이지 이동 → 신청 → spec의 신청 성공 hook이 자동 watchlist 해제.

### 엣지 케이스
- 자리 났다 곧바로 다시 마감: `seat-opened` → `seat-closed` 이벤트 둘 다 발생. 알림은 옵션화 — 기본은 `seat-opened`만.
- watchlist에 있지만 특강이 SWM에서 사라짐(`lecture-removed`): `자리 알림 종료` 토스트(또는 큐 항목) 후 자동 제거.
- 신청 후 다시 취소 → 자동 재추가하지 않음(사용자 명시 행위).
- 사용자가 시간 충돌(spec의 `OVERLAP`) 알면서도 관심 등록한 경우: 차단하지 않고 옆에 작은 경고 아이콘.

## 5. UI 변경

- 목록 행: 관심 등록 별표/버튼. 등록 상태에 따라 시각 차이.
- 상세 페이지: 모집 명 영역 옆 큰 버튼 (만석일 때 더 강조).
- 옵션 페이지: `관심 특강` 섹션 (제목·시작 시각·정원·잔여석·등록일·해제·`상세 열기`).
- 알림 본문: `[자리났음] <제목> — 잔여 N석`.

## 6. 데이터 모델

```ts
type WatchedLecture = {
  qustnrSn: string;
  title: string;
  startAt: string;
  endAt: string;
  detailUrl: string;
  capacityWhenAdded?: number;
  applyCntWhenAdded?: number;
  memo?: string;
  addedAt: string;
};

// chrome.storage.sync (디바이스 동기화)
type Settings = {
  // ...
  watchedLectures: WatchedLecture[];
};
```

자동 정리 정책:
- `endAt` 지난 항목: 다음 폴링 사이클에 제거
- `lecture-removed` 이벤트로 제거된 항목: 사용자 알림 후 즉시 제거
- 신청 완료(`UPSERT_SOURCE_LECTURE` 성공) 시 즉시 제거

## 7. 의존성

- 읽기: `watchedLectures`, lecture 정보, seat 이벤트
- 쓰기: `watchedLectures`
- 호출: spec 07 publish, spec 08 enqueue, `UPSERT_SOURCE_LECTURE` 성공 핸들러 hook

## 8. 변경 / 신규 파일

- 수정: `src/content/content.js`·`apply.js` (관심 등록 UI), `src/background/service-worker.js` (UPSERT 성공 핸들러에 hook), `src/options/options.html`·`options.js`
- 신규: `src/background/lecture-watch.js`
- 테스트: `tests/unit/lecture-watch.test.js`

## 9. 메시지 프로토콜

- `WATCH_LECTURE_ADD`:
  - payload: `{ lecture: Lecture; memo?: string }`
  - response: `{ ok: boolean; watchedLectures: WatchedLecture[] }`
- `WATCH_LECTURE_REMOVE`:
  - payload: `{ qustnrSn: string }`
  - response: `{ ok: boolean; watchedLectures: WatchedLecture[] }`
- `WATCH_LECTURE_LIST`:
  - response: `{ watchedLectures: WatchedLecture[] }`

## 10. 테스트 케이스

- unit (`lecture-watch.test.js`)
  - `seat-opened` 매칭 → 알림 발행, watchlist 유지
  - 신청 완료 hook → 자동 제거
  - `lecture-removed` 매칭 → 종료 안내 후 제거
  - `endAt` 지나면 정리
  - watchlist 없을 때 매처 noop
- DOM
  - 만석 행에서 관심 등록 → storage 반영
  - 옵션 페이지 항목 표시·해제

## 11. 비기능 요구사항

- watchlist 100건 cap.
- 알림 폭주 방지: 같은 qustnrSn에 대해 같은 카테고리 알림 중복 시 spec 07의 동일 알림 ID 갱신.
- 권한 추가 없음.

## 12. 미해결 질문

- `@user` `seat-closed` 알림 기본값 OFF로 둘지 ON으로 둘지. (잠시 났다 닫히는 상황에 대비한 기록 가치)
- `@user` 관심 등록 시 충돌 경고를 막을 vs 차단할지. 차단은 과한 것 같아 경고만 추천.
- `@tbd` 자동 제거 시 사용자에게 읽음 처리되지 않은 큐 항목까지 같이 정리할지(현재는 큐는 별개 정책).

## 13. 관련 링크

- 관련 spec: 06 seat 이벤트, 07, 08, 09
