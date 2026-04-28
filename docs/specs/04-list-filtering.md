# Spec 04: 목록 필터링

> Status: draft
> Branch: feature/04-list-filtering
> Phase: 1
> Depends on: 02 (category), 03 (mentor) — 필터 옵션이 의미 있어지려면 메타데이터 선행

## 1. 목적

기존엔 `전체 / 겹침만 / 바로 이어짐만 / 겹치지 않음만` 충돌 상태 필터만 있다. 카테고리·멘토·시간대·신청 상태·자리 여유 같은 **다축 필터**를 합쳐 빠르게 좁힐 수 있게 한다.

## 2. 사용자 스토리

- as a 연수생, I want 카테고리·멘토·시간대로 필터하고, so that 관심 강의만 본다.
- as a 연수생, I want 자리가 남은 강의만 보고, so that 신청 가능한 후보를 추린다.
- as a 연수생, I want 필터 조합을 저장(프리셋)하고, so that 매번 같은 조작을 반복하지 않는다.

## 3. 범위

### 포함
- 필터 축
  - 충돌 상태 (기존 유지)
  - 카테고리 (다중 선택, OR)
  - 멘토 (다중 선택, OR)
  - 시간대 (시작 시각 범위, 예: 18:00~22:00)
  - 자리 여유 (가능 / 마감 임박 / 마감) — `applyCnt`·정원 데이터 필요
  - 신청 상태 (미신청 / 신청완료 / 본인이 취소함) — 접수내역 매핑과 결합
- 필터 조합은 **AND**, 같은 축의 다중값은 **OR**
- 필터 프리셋 저장·불러오기 (`chrome.storage.sync`)
- 캘린더 뷰에도 동일 필터 즉시 적용

### 제외
- 텍스트 검색(별도 spec으로 분리 가능)
- 정규식 입력
- 필터를 URL로 공유

## 4. 동작 시나리오

### Golden path
1. 목록 상단 필터 바에 축 칩들이 펼쳐진다(`상태`, `카테고리`, `멘토`, `시간대`, `자리`, `신청`).
2. 사용자가 칩을 클릭하면 드롭다운에서 다중 선택.
3. 선택할 때마다 표·캘린더가 실시간 갱신된다(서버 재요청 없음, 메모리에서 필터).
4. 우측 `프리셋 저장` → 이름 입력 → 저장. 이후 드롭다운에서 불러올 수 있음.
5. `초기화`로 모든 필터 해제.

### 엣지 케이스
- 메타데이터(카테고리·멘토)가 비어 있는 특강: 해당 축 필터를 사용하면 제외.
- `자리 여유` 축은 정원·신청수 파싱이 가능한 페이지에서만 의미 있음. 목록 페이지에서 해당 정보 없는 경우 축 자체를 비활성화하거나 `(미상)` 그룹으로.
- 프리셋 이름 충돌: 덮어쓰기 확인 다이얼로그.

## 5. UI 변경

- 페이지: 특강 목록 페이지 상단 필터 바 확장
- 위치: 기존 충돌 상태 필터 바를 다축 칩 바로 교체
- 캘린더: 캘린더 뷰가 활성일 때도 같은 필터 적용
- mock fixture: `mock/list.html`에 다양한 메타·신청수 케이스 추가

## 6. 데이터 모델

```ts
type FilterState = {
  conflict: Set<"OVERLAP" | "BACK_TO_BACK_PREV" | "CLEAR" | "UNKNOWN">; // 비어있으면 전체
  categories: string[];   // 사용자 그룹 라벨, 비어있으면 전체
  mentors: string[];      // mentorKey 사용
  timeRange: { startHour: number; endHour: number } | null;
  capacity: Set<"open" | "almostFull" | "closed"> | null;
  applyState: Set<"none" | "applied" | "cancelled"> | null;
};

type FilterPreset = {
  id: string;
  name: string;
  state: FilterState;
  createdAt: string;
};

// chrome.storage.sync
type Settings = {
  // ...
  filterPresets: FilterPreset[];
  lastFilterState?: FilterState; // 세션 간 유지
};
```

`capacity` 판정 임계값(예: 잔여 ≤ 10% → `almostFull`)은 옵션화 가능하지만 본 spec에선 하드코드: `잔여 0 → closed`, `잔여 ≤ 정원의 10% → almostFull`, `그 외 → open`.

## 7. 의존성

- 읽기: 파싱된 lecture 배열, 충돌 상태, `Settings`, lectureMappings(신청 상태 결정용)
- 쓰기: `lastFilterState`, `filterPresets`
- 호출: 기존 `GET_LECTURE_MAPPINGS`로 신청 상태 도출

## 8. 변경 / 신규 파일

- 수정: `src/content/content.js` (필터 바·필터 적용 로직), `src/content/styles.css`, `mock/list.html`
- 신규: `src/content/filter-engine.js` (순수 함수: `applyFilter(lectures, state) -> lectures`), `src/content/filter-ui.js` (DOM 컴포넌트)
- 테스트: `tests/unit/filter-engine.test.js`, `tests/unit/content-scripts.test.js`에 필터 UI 테스트 추가

## 9. 메시지 프로토콜

신규 메시지 없음.

## 10. 테스트 케이스

- unit (`filter-engine.test.js`)
  - 단일 축 필터, 다축 AND
  - 같은 축 다중값 OR
  - 빈 필터 = 전체 통과
  - 메타데이터 누락 lecture 처리
  - 시간대 경계(시작 시각 정확히 endHour)
- DOM
  - 칩 토글 → 표 즉시 갱신
  - 캘린더 뷰에도 같은 결과
  - 프리셋 저장·불러오기·삭제
- 수동 (`mock/list.html`)
  - 다양한 조합

## 11. 비기능 요구사항

- 필터 적용은 메모리에서 < 50ms (lecture 1000건 기준).
- 프리셋 30개 cap. 초과 시 추가 거부.

## 12. 미해결 질문

- `@user` 자리 여유 임계값(`almostFull`)을 옵션화할지.
- `@user` 텍스트 검색 축을 본 spec에 포함할지 별도 spec으로 분리할지.
- `@tbd` 신청 상태 `cancelled`를 어떻게 안정적으로 판정할지(접수내역 페이지를 거쳐야만 알 수 있음).

## 13. 관련 링크

- 코드: `src/content/content.js` 기존 충돌 상태 필터 바
- 관련 spec: 01 캘린더 뷰(필터 결과 동시 적용), 02 카테고리, 03 멘토, 06 스냅샷(자리 변동 신호 원천)
