# SOMA Schedule Helper 에이전트 실행 환경 스펙

이 문서는 SOMA Schedule Helper 확장 프로그램에 문제가 생겼을 때, 에이전트가 재현부터 원인 파악, 수정 검증까지 수행할 수 있는 로컬 실행 환경을 정의한다.

목표는 실제 확장 코드 경로를 최대한 유지하면서 SoMA 신청/취소 서버 동작만 제어 가능한 목업으로 대체하는 것이다. Google Calendar는 목업하지 않고 Chrome 프로필의 Google 로그인과 실제 Calendar API 연동으로 검증한다.

## 용어

- 특강-캘린더 연결 정보: 어떤 SoMA 특강이 어떤 Google Calendar 일정과 연결되어 있는지 확장 프로그램이 브라우저 저장소에 기록한 정보이다. 구현상 저장 위치는 `chrome.storage.local.lectureEventMappings`이다.
- 최종 신청 상태: 접수내역 기준으로 해당 특강이 현재 신청된 상태이다. Calendar 일정이 있어야 한다.
- 최종 취소 상태: 접수내역 기준으로 해당 특강이 현재 취소된 상태이다. Calendar 일정이 없어야 한다.
- 실제 Calendar 검증 모드: SoMA 신청/취소 요청만 목업하고, 확장의 background service worker와 Google Calendar API는 실제 경로를 사용하는 실행 모드이다.
- 전체 목업 모드: 기존 `mock/mock-env.js`처럼 SoMA 페이지, 신청/취소, Calendar 메시지까지 브라우저 내부에서 목업하는 수동 확인 모드이다.

## 환경 원칙

실제 Calendar 검증 모드가 이 스펙의 기준 실행 환경이다.

- 실제 확장 파일, content script, background service worker를 사용한다.
- SoMA 신청/취소 서버 요청만 목업한다.
- Google Calendar 조회, 생성, 갱신, 삭제는 실제 `chrome.identity.getAuthToken()` 및 Google Calendar API로 수행한다.
- 기존 `mock/` fixture는 DOM 구조와 UI 흐름 확인에 사용할 수 있지만, Calendar 생성/삭제 최종 검증에는 사용하지 않는다.
- 테스트 Calendar 또는 테스트 Chrome 프로필 사용을 권장한다.

SoMA 목업 범위는 아래 엔드포인트로 제한한다.

- `POST /sw/mypage/mentoLec/apply.json`
- `POST /sw/mypage/mentoLec/applyCancel.json`
- `POST /sw/mypage/userAnswer/cancel.json`

Google Calendar 관련 확장 메시지는 목업하지 않는다.

- `GET_CALENDAR_EVENTS`
- `UPSERT_SOURCE_LECTURE`
- `SYNC_SOURCE_LECTURES`
- `DELETE_CALENDAR_EVENT_BY_LECTURE`
- `DELETE_CALENDAR_EVENT`

## 로그인과 보안 제약

SoMA 로그인 정보는 로컬 파일로 관리한다.

- 권장 파일명: `.agent/soma-login.local.json`
- 저장 항목은 자동 로그인 또는 세션 준비에 필요한 최소 값으로 제한한다.
- 로그인 파일은 대화, 로그, 스크린샷, 문서, fixture, GitHub, 배포 ZIP에 포함하지 않는다.
- 로그인 파일 값은 예제 데이터나 테스트 fixture로 재사용하지 않는다.
- 로그인 파일 값은 에이전트 학습 데이터나 프롬프트 예시로 사용하지 않는다.
- `.gitignore`는 `.agent/soma-login.local.json` 및 `.agent/*.local.json`을 제외해야 한다.

Google 로그인은 파일로 관리하지 않는다.

- Chrome 사용자 프로필의 로그인 세션을 사용한다.
- Google 비밀번호, OAuth refresh token, access token을 파일에 저장하지 않는다.
- Calendar 권한은 확장의 `chrome.identity.getAuthToken()` 흐름으로 획득한다.

보안 항목은 환경 제약으로 관리하며 기능 Test Plan에는 포함하지 않는다.

## 상태 판정 규칙

접수내역 동기화는 `최종 신청 상태`와 `최종 취소 상태`만 산출한다. 별도의 `재신청` 상태, 배지, 통계 값은 만들지 않는다.

- 같은 특강이 신청 목록과 취소 목록 양쪽에서 발견되면 최종 신청 상태로 판단한다.
- 최종 신청 상태인 특강은 Calendar에 일정이 있어야 한다.
- 최종 취소 상태인 특강은 Calendar에 일정이 없어야 한다.
- 신청 상태 특강의 Calendar 일정이 없으면 동기화 중 새 일정이 생성되어야 한다.
- 취소 상태 특강의 Calendar 일정이 남아 있으면 동기화 중 삭제되어야 한다.

Calendar 생성/삭제 여부는 아래 관찰 지점으로 확인한다.

- Google Calendar UI 또는 Google Calendar API 응답
- 특강-캘린더 연결 정보: `chrome.storage.local.lectureEventMappings`
- Google Calendar 이벤트의 `extendedProperties.private.somaManaged`
- background service worker console output
- content script console output

## 목록 필터 규칙

특강 목록에서는 사이트 기본 필터와 확장 필터가 순서와 관계없이 모두 적용되어야 한다.

- 사이트 기본 필터: 전체, 접수중, 마감
- 확장 필터: 날짜 범위, 겹침 상태
- 최종 목록은 사이트 기본 필터와 확장 필터 조건의 교집합이어야 한다.
- 사이트 기본 필터를 먼저 조작한 뒤 확장 필터를 적용해도 결과가 같아야 한다.
- 확장 필터를 먼저 조작한 뒤 사이트 기본 필터를 적용해도 결과가 같아야 한다.

기능 테스트를 위해 mock 목록 fixture에는 전체/접수중/마감 기본 필터 폼 또는 링크가 필요하다.

## 실행 시나리오

### 1. 특강 목록 필터 조합

목적은 사이트 기본 필터와 확장 날짜/겹침 필터가 독립적으로 보존되고 함께 적용되는지 확인하는 것이다.

필수 fixture:

- 전체/접수중/마감 기본 필터
- 날짜 범위 안팎의 특강
- 겹침, 바로 이어짐, 겹치지 않음, 시간 확인 필요 상태를 만들 수 있는 Calendar 일정

기대 결과:

- 전체/접수중/마감 적용 후 날짜/겹침 필터를 적용해도 조건의 교집합만 보인다.
- 날짜/겹침 필터 적용 후 전체/접수중/마감 필터를 적용해도 같은 결과가 나온다.
- 페이지 이동 또는 기본 필터 submit 이후에도 날짜 범위가 유지된다.

### 2. 상세 신청

목적은 상세 화면에서 SoMA 신청 성공 후 실제 Calendar 일정이 생성 또는 갱신되는지 확인하는 것이다.

목업 응답:

```json
{
  "resultCode": "success",
  "msg": "신청 하였습니다."
}
```

기대 결과:

- 신청 성공 후 `UPSERT_SOURCE_LECTURE`가 실제 background service worker로 전달된다.
- Calendar에 `somaManaged: "1"` 이벤트가 생성되거나 기존 이벤트가 갱신된다.
- 특강-캘린더 연결 정보가 해당 Calendar 이벤트를 가리킨다.

### 3. 상세 취소

목적은 상세 화면에서 SoMA 취소 성공 후 실제 Calendar 일정이 삭제되는지 확인하는 것이다.

목업 응답:

```json
{
  "resultCode": "success",
  "cancelAt": "Y"
}
```

기대 결과:

- 취소 성공 후 `DELETE_CALENDAR_EVENT_BY_LECTURE`가 실제 background service worker로 전달된다.
- 연결된 Calendar 이벤트가 삭제된다.
- 특강-캘린더 연결 정보에서 해당 특강이 제거된다.

### 4. 목록 패널 취소

목적은 특강 목록의 겹침 패널 또는 신청 목록 기반 취소 UI에서 취소한 뒤 Calendar가 정리되는지 확인하는 것이다.

필수 fixture:

- 취소 가능한 신청 완료 특강
- 24시간 이내라 취소 불가능한 신청 완료 특강

기대 결과:

- 취소 가능한 특강은 `/sw/mypage/userAnswer/cancel.json` 목업이 `cancelAt: "Y"`를 반환한다.
- 취소 후 접수내역 기준 동기화가 실행되고 Calendar 일정이 삭제된다.
- 24시간 이내 특강은 UI에서 차단되거나 목업이 `cancelAt: "N"`을 반환하며 Calendar 일정은 유지된다.

### 5. 접수내역 취소

목적은 접수내역 페이지의 취소 링크에서 취소한 뒤 Calendar가 정리되는지 확인하는 것이다.

기대 결과:

- 취소 링크의 `delDate(applySn, qustnrSn, gubun)` 파라미터가 올바르게 읽힌다.
- `/sw/mypage/userAnswer/cancel.json` 목업 성공 후 접수내역 동기화가 실행된다.
- 최종 취소 상태인 특강의 Calendar 일정과 특강-캘린더 연결 정보가 삭제된다.

### 6. 접수내역 동기화: 신청 상태 특강 누락

목적은 신청 상태 특강의 Calendar 일정이 없을 때 동기화로 일정이 추가되는지 확인하는 것이다.

검증 케이스:

- Calendar 일정과 특강-캘린더 연결 정보가 모두 없는 경우
- 특강-캘린더 연결 정보는 있지만 실제 Calendar 일정만 없는 경우

기대 결과:

- 접수내역 동기화 후 Calendar에 `somaManaged: "1"` 일정이 생성된다.
- 특강-캘린더 연결 정보가 새 Calendar 이벤트 ID로 저장된다.
- background 응답의 상세 결과는 `created` 또는 재연결/갱신에 해당하는 상태를 보여준다.

### 7. 접수내역 동기화: 취소 상태 특강 잔존

목적은 취소 상태 특강의 Calendar 일정이 남아 있을 때 동기화로 삭제되는지 확인하는 것이다.

기대 결과:

- 접수내역 동기화 후 해당 Calendar 일정이 삭제된다.
- 특강-캘린더 연결 정보에서 해당 특강이 제거된다.
- background 응답의 삭제 통계가 증가한다.

### 8. 최종 상태 우선순위

목적은 같은 특강이 신청 상태와 취소 상태 양쪽에서 발견될 때 최종 신청 상태를 우선하는지 확인하는 것이다.

기대 결과:

- 별도의 `재신청` 상태는 생성되지 않는다.
- 해당 특강은 최종 신청 상태로 처리된다.
- Calendar 일정이 삭제되지 않고 존재해야 한다.
- Calendar 일정이 없으면 동기화 중 생성되어야 한다.

## Fixture 요구사항

기능 테스트 fixture는 아래 상태를 표현할 수 있어야 한다.

- 신청 상태인데 Calendar 일정이 없는 특강
- 취소 상태인데 Calendar 일정이 남아 있는 특강
- 신청/취소 양쪽에 잡히지만 최종 신청 상태로 판단해야 하는 특강
- 전체/접수중/마감 기본 필터
- 취소 가능한 신청 완료 특강
- 24시간 이내 취소 불가 특강
- 날짜 범위 안팎의 특강
- 충돌 판정용 개인 Calendar 일정

기존 `mock/mock-env.js`는 전체 목업 모드에서 계속 사용할 수 있다. 다만 실제 Calendar 검증 모드에서는 Calendar 메시지를 브라우저 내부 목업으로 처리하지 않아야 한다.

## Test Plan

### 신청 누락 동기화

1. 신청 상태 특강의 Calendar 일정과 특강-캘린더 연결 정보를 제거한다.
2. 접수내역 동기화를 실행한다.
3. Calendar에 `somaManaged: "1"` 일정이 생성되는지 확인한다.
4. 특강-캘린더 연결 정보가 생성된 Calendar 이벤트를 가리키는지 확인한다.
5. 특강-캘린더 연결 정보만 남기고 Calendar 일정만 삭제한다.
6. 접수내역 동기화를 다시 실행한다.
7. Calendar 일정이 재생성되고 연결 정보가 갱신되는지 확인한다.

### 취소 잔존 동기화

1. 취소 상태 특강의 Calendar 일정을 남겨둔다.
2. 접수내역 동기화를 실행한다.
3. Calendar 일정이 삭제되는지 확인한다.
4. 특강-캘린더 연결 정보가 삭제되는지 확인한다.

### 최종 상태 우선순위

1. 같은 특강이 신청 상태와 취소 상태 양쪽에 잡히는 fixture를 준비한다.
2. 접수내역 동기화를 실행한다.
3. 해당 특강이 최종 신청 상태로 판단되는지 확인한다.
4. Calendar 일정이 존재하는지 확인한다.

### 신청/취소 화면 흐름

1. 상세 신청에서 신청을 실행한다.
2. Calendar 일정이 생성 또는 갱신되는지 확인한다.
3. 상세 취소에서 취소를 실행한다.
4. Calendar 일정이 삭제되는지 확인한다.
5. 목록 패널 취소를 실행한다.
6. `cancelAt: "Y"` 후 Calendar 일정이 정리되는지 확인한다.
7. 접수내역 취소 링크를 실행한다.
8. `cancelAt: "Y"` 후 Calendar 일정이 정리되는지 확인한다.
9. 24시간 이내 취소 케이스에서는 취소 차단 또는 `cancelAt: "N"` 처리 후 Calendar 일정이 유지되는지 확인한다.

### 목록 필터

1. 전체/접수중/마감 중 하나를 먼저 적용한다.
2. 날짜 범위와 겹침 필터를 적용한다.
3. 최종 목록을 기록한다.
4. 같은 조건에서 날짜 범위와 겹침 필터를 먼저 적용한다.
5. 전체/접수중/마감 필터를 나중에 적용한다.
6. 두 순서의 최종 결과가 동일한지 확인한다.

## 수용 기준

- SoMA 신청/취소 외에는 실제 확장 코드 경로를 사용한다.
- 실제 Calendar 검증 모드에서 신청 상태 특강 누락은 Calendar 생성으로 복구된다.
- 실제 Calendar 검증 모드에서 취소 상태 특강 잔존은 Calendar 삭제로 정리된다.
- 신청/취소 양쪽에 잡힌 특강은 최종 신청 상태로 처리된다.
- 목록 필터는 조작 순서와 관계없이 사이트 기본 필터와 확장 필터의 교집합을 보여준다.
- 로그인 비밀값은 저장소, 문서, fixture, 로그, GitHub, 배포 ZIP에 포함되지 않는다.
