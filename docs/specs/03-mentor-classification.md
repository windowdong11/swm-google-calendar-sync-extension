# Spec 03: 멘토별 분류

> Status: draft
> Branch: feature/03-mentor-classification
> Phase: 1
> Depends on: parser 확장(mentor 필드 추가) — 본 spec 안에 포함

## 1. 목적

특강은 멘토(강사) 단위로 관심도가 갈린다(같은 멘토의 시리즈를 다 듣고 싶다거나, 기존에 강의를 들었던 멘토만 보고 싶다거나). 멘토 메타데이터를 추출하고 분류·표시·필터링·관심 등록 기반을 만든다.

## 2. 사용자 스토리

- as a 연수생, I want 특강 행에 멘토명을 보고, so that 누가 가르치는지 즉시 안다.
- as a 연수생, I want 멘토별로 묶어 보고, so that 관심 멘토의 강의를 한 번에 훑는다.
- (Phase 3 의존) 관심 멘토 등록 기반.

## 3. 범위

### 포함
- 목록 / 상세 / 접수내역 파서에서 멘토명·소속 추출
- lecture 객체에 `mentorName` (필요 시 `mentorAffiliation`) 추가
- 목록 행과 캘린더 카드에 멘토 칩 표시
- 멘토별 그룹 뷰(`목록을 멘토별로 묶어서`) 옵션
- 멘토명 정규화(공백·괄호 등으로 인한 중복 합치기)

### 제외
- 멘토 프로필 페이지·외부 링크 통합
- 멘토 사진·메타 정보 fetch

## 4. 동작 시나리오

### Golden path
1. 사용자가 목록을 연다.
2. 각 행 제목 아래 또는 옆에 멘토 칩(예: `홍길동 멘토`)이 보인다.
3. 상단 필터 바에 `정렬: 시간순 / 멘토순` 토글이 있다.
4. `멘토순`을 누르면 같은 멘토의 특강이 인접하게 그룹 헤더와 함께 표시된다.
5. 멘토 칩 우측 별표(★)를 누르면 관심 멘토 등록 — 단, **본 spec에서는 별표 UI만 두고 동작은 spec 09에서 연결**.

### 엣지 케이스
- 멘토 정보가 비어 있는 특강: `(미정)` 칩.
- 한 특강에 멘토 여러 명: 콤마·슬래시 분리 후 다중 칩.
- 멘토명 표기 차이("홍길동" vs "홍길동(소속)"): 정규화 함수로 합쳐 동일 멘토로 처리. 단, 표시는 원문 유지.

## 5. UI 변경

- 페이지
  - 목록: 행에 멘토 칩 + 상단 정렬 토글 + 멘토 그룹 헤더
  - 캘린더: 카드에 멘토명(작게)
  - 옵션: 정규화 규칙(별칭 → 정식 명) 편집 섹션
- mock fixture: 동일 멘토 다수 행, 표기 변형 행 추가

## 6. 데이터 모델

lecture 객체 확장:

```ts
type Lecture = {
  // ... 기존 + spec 02
  mentorName: string;          // 표시용 원문
  mentorKey: string;           // 정규화 결과 (그룹화·매칭에 사용)
  mentorNames?: string[];      // 다수 멘토 케이스
};
```

storage:

```ts
// chrome.storage.sync
type MentorAlias = { from: string; to: string }; // raw → 정식
type Settings = {
  // ... 기존
  mentorAliases: MentorAlias[];
  listSortMode: "time" | "mentor"; // 기본 "time"
};
```

## 7. 의존성

- 읽기: 페이지 DOM 멘토 컬럼 (위치 `@tbd`), `mentorAliases`, `listSortMode`
- 쓰기: 옵션 페이지에서 `mentorAliases`, 목록 페이지 토글에서 `listSortMode`
- 호출: 신규 메시지 없음.

## 8. 변경 / 신규 파일

- 수정: `src/content/parsers.js`, `src/content/content.js`, `src/content/apply.js`, `src/options/options.html`·`options.js`, `src/content/styles.css`, `mock/*.html`
- 신규: `src/content/mentor-normalize.js`
- 테스트: `tests/unit/mentor-normalize.test.js`, parser 테스트 보강

## 9. 메시지 프로토콜

신규 메시지 없음.

## 10. 테스트 케이스

- unit (`mentor-normalize.test.js`)
  - 공백·괄호·소속 변형이 같은 키로 정규화되는지
  - 별칭 매핑 적용
- DOM
  - 멘토 칩 렌더, 그룹 헤더 정렬
- 수동
  - 옵션 페이지에서 별칭 추가 후 같은 멘토로 묶이는지

## 11. 비기능 요구사항

- 추가 권한 없음.
- 별칭 매핑 50건 이하 가정.

## 12. 미해결 질문

- `@user` 실제 SWM 페이지에서 멘토명 위치(컬럼·DOM)는? mock 갱신 필요.
- `@user` 멘토명 표기에 소속 포함 정도(예: `홍길동 / OO대` vs `홍길동(OO)`).
- `@tbd` 정규화 알고리즘 상세 — 한국어 이름 동명이인 처리.

## 13. 관련 링크

- 코드: `src/content/parsers.js`
- 관련 spec: 02 카테고리 분류, 04 필터링, 09 관심 멘토 등록
