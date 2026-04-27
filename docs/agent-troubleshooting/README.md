# SOMA Schedule Helper 에이전트 문제 해결 문서

이 문서 묶음은 SOMA Schedule Helper 확장 프로그램에 문제가 생겼을 때, 에이전트가 재현부터 원인 파악, 수정 검증까지 수행할 수 있는 로컬 실행 환경을 정의한다.

목표는 실제 확장 코드 경로를 최대한 유지하면서 SoMA 신청/취소 서버 동작만 제어 가능한 목업으로 대체하는 것이다. Google Calendar는 목업하지 않고 Chrome 프로필의 Google 로그인과 실제 Calendar API 연동으로 검증한다.

## 문서 구성

- [실행 환경](runtime-env.md): 실제 Calendar 검증 모드, 전체 목업 모드, 로그인과 보안 제약
- [동작 규칙](behavior-rules.md): 최종 신청/취소 상태 판정, Calendar 생성/삭제 기대 동작, 목록 필터 규칙
- [Fixture 요구사항](fixtures.md): 기능 테스트에 필요한 fixture 상태와 SoMA 신청/취소 목업 응답
- [테스트 시나리오](test-scenarios.md): 기능 테스트별 목적, 준비, 실행, 기대 결과

## 용어

- 특강-캘린더 연결 정보: 어떤 SoMA 특강이 어떤 Google Calendar 일정과 연결되어 있는지 확장 프로그램이 브라우저 저장소에 기록한 정보이다. 구현상 저장 위치는 `chrome.storage.local.lectureEventMappings`이다.
- 최종 신청 상태: 접수내역 기준으로 해당 특강이 현재 신청된 상태이다. Calendar 일정이 있어야 한다.
- 최종 취소 상태: 접수내역 기준으로 해당 특강이 현재 취소된 상태이다. Calendar 일정이 없어야 한다.
- 실제 Calendar 검증 모드: SoMA 신청/취소 요청만 목업하고, 확장의 background service worker와 Google Calendar API는 실제 경로를 사용하는 실행 모드이다.
- 전체 목업 모드: 기존 `mock/mock-env.js`처럼 SoMA 페이지, 신청/취소, Calendar 메시지까지 브라우저 내부에서 목업하는 수동 확인 모드이다.

## 수용 기준

- SoMA 신청/취소 외에는 실제 확장 코드 경로를 사용한다.
- 실제 Calendar 검증 모드에서 신청 상태 특강 누락은 Calendar 생성으로 복구된다.
- 실제 Calendar 검증 모드에서 취소 상태 특강 잔존은 Calendar 삭제로 정리된다.
- 신청/취소 양쪽에 잡힌 특강은 최종 신청 상태로 처리된다.
- 목록 필터는 조작 순서와 관계없이 사이트 기본 필터와 확장 필터의 교집합을 보여준다.
- 로그인 비밀값은 저장소, 문서, fixture, 로그, GitHub, 배포 ZIP에 포함되지 않는다.
