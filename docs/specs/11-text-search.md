# Spec 11: 자유 텍스트 검색

> Status: draft
> Branch: feature/11-text-search
> Phase: 1
> Depends on: 04 (목록 필터링) — 동일 파이프라인에 검색 축 추가

## 1. 목적

특강 제목·멘토·설명 텍스트로 자유 검색. spec 04 필터(카테고리/멘토/상태 등)와 같은 결과 영역을 공유하되, 분리된 입력·로직으로 운영해 spec 04의 응집도를 유지한다. (2026-04-30 결정 U-04-2: spec 04에 포함하지 않고 별도 spec으로 분리.)

## 2. 사용자 스토리

- as a 연수생, I want 특강 목록 위에 검색창에 텍스트를 입력하면 제목·멘토·설명에서 부분 일치하는 특강만 보여주고, so that "그 단어 들어 있던 특강이 어디 있더라" 탐색이 빠르다.
- as a 연수생, I want 검색어가 spec 04 필터와 함께 AND로 결합되고, so that "이번 주 + 알고리즘"처럼 좁힐 수 있다.

## 3. 범위

### 포함
- 검색 입력 위치: spec 04 필터 바 옆 (목록 페이지) + 캘린더 사이드 패널 상단
- 검색 대상 필드: `title`, `mentor`, `place` (default). 옵션으로 `description` 토글
- 매칭: 한글·영문 모두 부분 문자열 일치 (case-insensitive). 공백으로 split된 토큰 모두 매치 (AND)
- spec 04 필터 결과와 AND 결합
- 검색어 storage(`chrome.storage.local.searchQuery`) — 페이지 reload 시 복원
- 빈 검색어면 모든 결과(검색 비활성)

### 제외
- 정규식·와일드카드
- 검색어 history·자동완성 (Phase 2+)
- 외부 검색 인덱스(IndexedDB·SQLite 등)
- spec 04 필터 자체 변경 (검색은 plug-in)

## 4. 동작 시나리오

### Golden path
1. 사용자가 검색창에 토큰 입력 → 매 키 입력마다 100ms debounce 후 spec 04 필터 결과에 AND 결합
2. 결과 카운트 즉시 갱신
3. 검색어 비우면 spec 04 필터만 적용된 원래 결과로 복귀

### 엣지 케이스
- 0건 결과: "검색 결과 없음" + 검색어 일부 제거 제안
- 검색 대상 lecture가 lectureSnapshot이 비어 있을 때: spec 04와 동일 안내
- 한글 자모 분리(예: "ㅇㄹㄱㄹㅈ")는 매치 X (Phase 2+에서 한글 분해 매처 검토)

## 5. UI 변경

- spec 04 필터 바 우측에 검색 input (placeholder: "검색")
- 캘린더 사이드 패널 상단에 동일 검색 input
- 검색어 활성 시 input에 `×` 버튼으로 즉시 비우기

## 6. 데이터 모델

```ts
type SearchQuery = string; // chrome.storage.local.searchQuery, 기본 ""
```

검색 함수는 spec 01의 `lecture-filter.js`에 추가된 `additionalFilters` plug-in 슬롯에 등록되는 형태로 spec 11 코드는 한 predicate 함수만 export.

```ts
function makeSearchPredicate(query: SearchQuery): (lecture: Lecture) => boolean;
```

## 7. 의존성

- 읽기: `chrome.storage.local.searchQuery`, lectureSnapshot (spec 05)
- 쓰기: `chrome.storage.local.searchQuery`
- plug-in: spec 01 `lecture-filter.js`의 `additionalFilters`, spec 04 필터 파이프라인

## 8. 변경 / 신규 파일

- 신규:
  - `src/search/search-predicate.js` (`makeSearchPredicate`)
  - `src/search/search-input.js` (UI 컴포넌트)
  - `tests/unit/search-predicate.test.js`
- 수정:
  - `src/calendar/calendar.js`·`src/content/content.js`: `additionalFilters`에 검색 predicate 등록
  - `manifest.json`: 신규 자원 노출 필요 시

## 9. 메시지 프로토콜

신규 메시지 없음. `chrome.storage.local.searchQuery` 직접 read/write.

## 10. 테스트 케이스

- unit: 토큰 분리·case-insensitive·다중 토큰 AND·빈 검색어 통과·필드 옵션
- DOM: 검색 input → 결과 카운트 즉시 변경
- 수동: 캘린더 사이드 패널·목록 페이지에서 검색이 spec 04 필터와 정확히 결합되는지

## 11. 비기능 요구사항

- debounce 100ms, 1000건 lecture 기준 매칭 < 30ms
- 검색어 저장은 sync가 아닌 local (개인 정보·세션 한정)
- 추가 권한 없음

## 12. 미해결 질문

- `@tbd` 한글 자모 분해 매처 — 사용자 요구가 명확해질 때 추가 검토
- `@tbd` description 필드를 default 검색 대상에 포함할지 (현재는 옵션 토글)
- `@tbd` 검색 hit highlight (`<mark>` 태그) — UX 개선 효과 vs 구현 비용

## 13. 관련 링크

- 관련 spec: 04 필터링 (검색 결과 AND 결합), 01 캘린더 (사이드 패널 검색 input + plug-in 슬롯), 03 멘토 분류 (mentor 필드 매칭)
