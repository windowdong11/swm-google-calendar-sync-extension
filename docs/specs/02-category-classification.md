# Spec 02: 카테고리 분류

> Status: draft
> Branch: feature/02-category-classification
> Phase: 1
> Depends on: parser 확장(category 필드 추가) — 본 spec 안에 포함

## 1. 목적

특강은 주제·트랙(예: AI, 백엔드, 프로덕트, 기획, 디자인 등)이 달라 관심이 갈리지만, 현재 목록은 평면 리스트라 트랙 단위로 골라 보기 어렵다. **카테고리 메타데이터**를 추가해 분류·필터링·통계의 기반을 만든다.

## 2. 사용자 스토리

- as a 연수생, I want 특강을 카테고리별로 묶어 보고, so that 관심 트랙만 빠르게 훑을 수 있다.
- as a 연수생, I want 카테고리 통계(이번 달 AI 트랙 N건)를 보고, so that 관심 트랙의 빈도를 가늠한다.

## 3. 범위

### 포함
- 특강 목록 페이지 / 상세 / 접수내역 파서에서 **카테고리 텍스트 추출**
- lecture 객체에 `category` 필드 추가
- 목록 행과 캘린더 카드에 카테고리 칩(배지) 표시
- 사용자 정의 카테고리 그룹핑 규칙 (옵션 페이지에서 raw 카테고리 → 사용자 그룹 매핑)

### 제외
- 카테고리 자동 분류·NLP. raw 텍스트와 사용자 매핑만.
- 카테고리 단위 신청·취소 일괄 처리

## 4. 동작 시나리오

### Golden path
1. 사용자가 목록을 연다.
2. 각 행 제목 옆에 카테고리 칩(예: `AI`)이 보인다.
3. 옵션 페이지에서 raw 카테고리 → 사용자 그룹 매핑(예: `AI 모델`, `AI 윤리` → `AI`)을 편집할 수 있다.
4. 매핑된 사용자 그룹이 칩 텍스트로 사용된다. 매핑 없으면 raw 카테고리.

### 엣지 케이스
- 카테고리 컬럼이 페이지에 없거나 비어 있는 특강: 칩 없이 표시. 통계에서 `(미분류)`로 묶음.
- raw 카테고리에 여러 값이 콤마·슬래시로 들어 있을 수 있음: 분리하여 다중 칩 표시.
- 사용자 매핑이 같은 raw를 여러 그룹에 매핑: 가장 위 항목이 우선(목록 순서).

## 5. UI 변경

- 페이지
  - 목록: 행 제목 옆 칩, 상단 요약 바에 카테고리별 카운트
  - 캘린더: 카드 좌측 하단에 칩
  - 옵션: 카테고리 매핑 편집 섹션 신규
- mock fixture: `mock/list.html`에 카테고리 컬럼이 있는 행 추가, `mock/view-apply.html`에도 추가

## 6. 데이터 모델

lecture 객체 확장:

```ts
type Lecture = {
  // ... 기존 필드
  rawCategories: string[]; // 페이지에서 직접 추출 (콤마·슬래시 분리 후 trim)
  categories: string[];    // 사용자 매핑 적용 후. 매핑 없으면 raw 그대로.
};
```

storage:

```ts
// chrome.storage.sync (사용자 설정이라 sync로)
type CategoryMapping = {
  rawPattern: string;      // 정확 매칭 또는 ^/$/* 와일드카드
  group: string;           // 사용자 정의 그룹 라벨
};
type Settings = {
  // ... 기존 설정
  categoryMappings: CategoryMapping[];
};
```

## 7. 의존성

- 읽기: 페이지 DOM의 카테고리 컬럼 (위치는 `@tbd`), `categoryMappings` 설정
- 쓰기: 옵션 페이지에서 `categoryMappings` 갱신
- 호출: 신규 메시지 없음. 카테고리 매핑은 content script에서 적용.

## 8. 변경 / 신규 파일

- 수정: `src/content/parsers.js` (목록·상세·접수내역 파서에 카테고리 추출), `src/content/content.js` (행 칩), `src/content/apply.js` (상세 칩), `src/options/options.html`·`options.js` (매핑 편집 UI), `src/content/styles.css`, `mock/*.html`
- 신규: `src/content/category-mapping.js` (raw → 그룹 변환 순수 함수)
- 테스트: `tests/unit/category-mapping.test.js`, `tests/unit/parsers.test.js`(이미 있다면 거기에)에 카테고리 추출 케이스 추가

## 9. 메시지 프로토콜

신규 메시지 없음.

## 10. 테스트 케이스

- unit (`category-mapping.test.js`)
  - 정확 매칭, 와일드카드 매칭
  - 다중 raw 문자열 분리 로직
  - 같은 raw가 여러 매핑에 걸린 경우 우선순위
  - 매핑 없을 때 raw 그대로 반환
- DOM
  - 목록 행에 칩 렌더링
  - mock fixture에 카테고리 셀이 없을 때 칩 미렌더
- 수동
  - 옵션 페이지에서 매핑 추가·삭제 → 목록 즉시 반영

## 11. 비기능 요구사항

- 매핑 100건 이하 가정. 매칭은 O(N×M)로 충분.
- `chrome.storage.sync` 용량 제한(8KB/key) 고려: 100건 × 평균 50바이트 ≈ 5KB 안전.

## 12. 미해결 질문

- `@user` 실제 SWM 목록 페이지에서 카테고리는 어떤 컬럼·DOM 구조에 있는가? (현재 `parsers.js`는 추출 안 함). mock 갱신을 위해 실제 페이지 캡처 필요.
- `@user` 카테고리 매핑 UI를 옵션 페이지에 둘지, 목록 페이지에서 칩 우클릭 메뉴로 둘지.
- `@tbd` 와일드카드를 정규식까지 허용할지(보안·UX 우려).

## 13. 관련 링크

- 코드: `src/content/parsers.js:74` 목록 파서, `src/content/parsers.js:121` 상세 파서
- 관련 spec: 03 멘토 분류 (동일한 메타데이터 추출 패턴), 04 필터링 (카테고리 필터 적용처)
