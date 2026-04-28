# Spec 06: 특강 스냅샷·diff

> Status: draft
> Branch: feature/06-lecture-snapshot-diff
> Phase: 2
> Depends on: 05 (스냅샷 원천), 02·03 (메타데이터)

## 1. 목적

폴링이 만든 스냅샷을 직전 스냅샷과 비교해 **변경 이벤트**를 만든다. 이 이벤트가 알림(spec 07)·알림 큐(spec 08)·관심 트리거(spec 09·10)의 단일 소스다.

## 2. 사용자 스토리

- as a 시스템, I need 두 스냅샷 간 차이를 일관된 형식으로 산출하고, so that 알림 모듈이 동일한 입력으로 동작한다.
- as a 연수생(spec 09·10 통해), I want 새 특강·자리 변동을 빠짐없이 감지하고, so that 신청 기회를 놓치지 않는다.

## 3. 범위

### 포함
- 두 스냅샷(`prev`, `next`)을 받아 다음 이벤트 배열 생성
  - `lecture-added`: 신규 등록
  - `lecture-removed`: 사라짐(취소·만료)
  - `seat-opened`: 자리가 추가로 생김(`applyCnt` 감소 또는 정원 증가)
  - `seat-closed`: 자리가 줄어듦(`applyCnt` 증가, 만석 도달)
  - `time-changed`: `startAt`/`endAt` 변경
  - `place-changed`: `place` 변경
  - `meta-changed`: 카테고리·멘토 변경
- 이벤트 객체 표준 스키마
- 이벤트 시간순 정렬·중복 제거
- 첫 폴링(prev 없음) 또는 구조 변경 의심(폴링 결과 0건) 시 이벤트 발행 보류

### 제외
- 알림 표시·큐잉(=spec 07·08)
- 관심 매칭(=spec 09·10)
- 직접적인 storage 영속화는 본 spec 책임이 아님 (`lectureSnapshot`은 spec 05가 관리). 본 spec은 순수 함수 + 약간의 publish glue.

## 4. 동작 시나리오

### Golden path
1. spec 05 폴링이 `next` 스냅샷을 저장 직전, 본 모듈의 `diff(prev, next)` 호출.
2. `diff`는 `LectureChangeEvent[]` 반환.
3. publish: 같은 service worker 내에서 `onLectureChange` 콜백 직접 호출 또는 `chrome.runtime` broadcast로 spec 07·08에 전달.
4. spec 05가 next 스냅샷을 저장 → prev로 승격.

### 엣지 케이스
- `prev`가 없거나 빈 배열: 이벤트 배열은 비어있음(첫 실행).
- next가 비어있고 prev는 있음: `structure-suspect` 플래그를 별도 필드로 반환 (spec 05가 알림 보류 결정).
- 같은 특강이 정원 증감을 함께 일으킨 경우(예: 정원 5→7, 신청 3→6): 자리 수 변화 종합 판정 → 자리 가용성 변동만 단일 이벤트(`seat-opened` 또는 `seat-closed`).
- 시간 변경과 자리 변경이 동시에 일어남: 두 이벤트 모두 발행. consumer가 묶거나 우선순위 결정.
- `qustnrSn`이 같은데 다른 특강 정보(SWM 운영 변경)가 들어옴: `lecture-replaced` 단일 이벤트로 처리할지 두 이벤트(`removed` + `added`)로 분리할지 — 우선 후자.

## 5. UI 변경

본 spec은 백엔드 모듈. UI 없음.

## 6. 데이터 모델

```ts
type LectureChangeEvent =
  | { type: "lecture-added"; lecture: Lecture; at: string }
  | { type: "lecture-removed"; lecture: Lecture; at: string }
  | { type: "seat-opened"; qustnrSn: string; before: SeatInfo; after: SeatInfo; at: string }
  | { type: "seat-closed"; qustnrSn: string; before: SeatInfo; after: SeatInfo; at: string }
  | { type: "time-changed"; qustnrSn: string; beforeStart: string; afterStart: string; beforeEnd: string; afterEnd: string; at: string }
  | { type: "place-changed"; qustnrSn: string; before: string; after: string; at: string }
  | { type: "meta-changed"; qustnrSn: string; before: { mentorKey?: string; categories?: string[] }; after: { mentorKey?: string; categories?: string[] }; at: string };

type SeatInfo = {
  applyCnt: number;
  capacity: number;
  available: number; // capacity - applyCnt
};

type DiffResult = {
  events: LectureChangeEvent[];
  structureSuspect: boolean; // next.lectures.length === 0 && prev.lectures.length > 0
};
```

`SeatInfo`는 정원·신청수 파싱이 가능한 lecture에서만 채움. 둘 중 하나라도 없으면 `seat-*` 이벤트 발행 안 함(노이즈 방지).

## 7. 의존성

- 읽기: prev/next 스냅샷 (인자로 전달)
- 쓰기: 없음 (순수 함수)
- 호출: 없음

## 8. 변경 / 신규 파일

- 신규: `src/background/lecture-diff.js`
- 수정: `src/background/polling.js` (diff 호출·publish glue), 필요 시 `service-worker.js`
- 테스트: `tests/unit/lecture-diff.test.js`

## 9. 메시지 프로토콜

내부 이벤트(서비스 워커 내):

- `onLectureChange(events: LectureChangeEvent[])` — spec 07·08·09·10이 구독

옵션: 디버그용 `chrome.runtime` 메시지로 직전 이벤트 N건 조회

- `DIFF_GET_RECENT`:
  - payload: `{ limit: number }`
  - response: `{ events: LectureChangeEvent[] }` (spec 08이 큐 표시 시 사용)

## 10. 테스트 케이스

- unit (`lecture-diff.test.js`)
  - 추가·삭제 단순 케이스
  - 자리 가용성 변경 (`available` 0→1, 1→0)
  - 정원·신청수 둘 다 변경되는 합산 케이스
  - 시간·장소·메타 변경
  - prev 없을 때 이벤트 0건
  - `structureSuspect` 플래그 트리거
  - 같은 qustnrSn 동시 다중 변화 → 다중 이벤트
  - 정원·신청수 일부 누락 시 seat 이벤트 미발행

## 11. 비기능 요구사항

- 순수 함수, 외부 호출 없음. 1000건 비교 < 20ms.
- 이벤트 발행 후 polling이 next를 prev로 승격하므로 본 모듈은 상태를 들고 있지 않음.

## 12. 미해결 질문

- `@user` `meta-changed`는 알림 가치가 낮을 수 있다(자주 변할 수 있음). 알림 발송 단계(spec 07)에서 기본 OFF로 둘지.
- `@tbd` 동일 시간대 강의가 시리즈로 사라지고 다시 등장하는 경우(SWM 운영 일시 비공개) 어떻게 보정할지. 현재 모델은 각각 `removed` → `added`로 보낸다.

## 13. 관련 링크

- 관련 spec: 05, 07, 08, 09, 10
