# 신청/취소 액션

## 상세 신청

목적: 상세 화면에서 SoMA 신청 성공 후 실제 Calendar 일정이 생성 또는 갱신되는지 확인한다.

준비:

- 상세 신청 페이지 fixture를 준비한다.
- `/sw/mypage/mentoLec/apply.json`은 성공 응답을 반환하도록 준비한다.

실행:

1. 상세 신청에서 신청을 실행한다.
2. `UPSERT_SOURCE_LECTURE`가 실제 background service worker로 전달되는지 확인한다.
3. Google Calendar UI 또는 API로 생성/갱신된 일정을 확인한다.

기대 결과:

- Calendar에 `somaManaged: "1"` 이벤트가 생성되거나 기존 이벤트가 갱신된다.
- 특강-캘린더 연결 정보가 해당 Calendar 이벤트를 가리킨다.

## 상세 취소

목적: 상세 화면에서 SoMA 취소 성공 후 실제 Calendar 일정이 삭제되는지 확인한다.

준비:

- 상세 취소 페이지 fixture를 준비한다.
- `/sw/mypage/mentoLec/applyCancel.json`은 `cancelAt: "Y"` 응답을 반환하도록 준비한다.

실행:

1. 상세 취소에서 취소를 실행한다.
2. `DELETE_CALENDAR_EVENT_BY_LECTURE`가 실제 background service worker로 전달되는지 확인한다.
3. Google Calendar UI 또는 API로 일정 삭제 여부를 확인한다.

기대 결과:

- 연결된 Calendar 이벤트가 삭제된다.
- 특강-캘린더 연결 정보에서 해당 특강이 제거된다.

## 목록 패널 취소

목적: 특강 목록의 겹침 패널 또는 신청 목록 기반 취소 UI에서 취소한 뒤 Calendar가 정리되는지 확인한다.

준비:

- 취소 가능한 신청 완료 특강을 준비한다.
- 24시간 이내라 취소 불가능한 신청 완료 특강을 준비한다.
- `/sw/mypage/userAnswer/cancel.json`은 케이스에 따라 `cancelAt: "Y"` 또는 `cancelAt: "N"`을 반환하도록 준비한다.

실행:

1. 목록 패널 취소를 실행한다.
2. 취소 후 접수내역 기준 동기화가 실행되는지 확인한다.
3. Google Calendar UI 또는 API로 일정 상태를 확인한다.

기대 결과:

- 취소 가능한 특강은 `cancelAt: "Y"` 후 Calendar 일정이 정리된다.
- 24시간 이내 특강은 UI에서 차단되거나 `cancelAt: "N"` 처리 후 Calendar 일정이 유지된다.

## 접수내역 취소

목적: 접수내역 페이지의 취소 링크에서 취소한 뒤 Calendar가 정리되는지 확인한다.

준비:

- 접수내역에 취소 가능한 신청 완료 특강을 준비한다.
- 취소 링크는 `delDate(applySn, qustnrSn, gubun)` 형태여야 한다.
- `/sw/mypage/userAnswer/cancel.json`은 `cancelAt: "Y"` 응답을 반환하도록 준비한다.

실행:

1. 접수내역 취소 링크를 실행한다.
2. 취소 링크의 파라미터가 올바르게 읽히는지 확인한다.
3. 취소 후 접수내역 동기화가 실행되는지 확인한다.
4. Google Calendar UI 또는 API로 일정 삭제 여부를 확인한다.

기대 결과:

- 최종 취소 상태인 특강의 Calendar 일정이 삭제된다.
- 특강-캘린더 연결 정보에서 해당 특강이 제거된다.

## 24시간 이내 취소 불가

목적: 특강 시작 24시간 이내 취소가 차단되고 Calendar 일정이 유지되는지 확인한다.

준비:

- 시작까지 24시간 이내인 신청 완료 특강을 준비한다.
- 취소 요청이 발생하는 경로에서는 `/sw/mypage/userAnswer/cancel.json` 또는 `/sw/mypage/mentoLec/applyCancel.json`이 `cancelAt: "N"`을 반환하도록 준비한다.

실행:

1. 상세 취소, 목록 패널 취소, 접수내역 취소 중 해당 fixture가 연결된 경로에서 취소를 시도한다.
2. UI 차단 메시지 또는 `cancelAt: "N"` 처리 결과를 확인한다.
3. Google Calendar UI 또는 API로 일정 상태를 확인한다.

기대 결과:

- 취소는 완료 상태로 처리되지 않는다.
- Calendar 일정은 유지된다.
- 특강-캘린더 연결 정보도 유지된다.
