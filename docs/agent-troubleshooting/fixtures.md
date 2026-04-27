# Fixture 요구사항

기능 테스트 fixture는 아래 상태를 표현할 수 있어야 한다.

- 신청 상태인데 Calendar 일정이 없는 특강
- 취소 상태인데 Calendar 일정이 남아 있는 특강
- 신청/취소 양쪽에 잡히지만 최종 신청 상태로 판단해야 하는 특강
- 전체/접수중/마감 기본 필터
- 취소 가능한 신청 완료 특강
- 24시간 이내 취소 불가 특강
- 날짜 범위 안팎의 특강
- 충돌 판정용 개인 Calendar 일정

## SoMA 신청 목업 응답

상세 신청 시 `/sw/mypage/mentoLec/apply.json`은 성공 케이스에서 아래 응답을 반환한다.

```json
{
  "resultCode": "success",
  "msg": "신청 하였습니다."
}
```

## SoMA 취소 목업 응답

상세 취소 시 `/sw/mypage/mentoLec/applyCancel.json`, 목록 패널 또는 접수내역 취소 시 `/sw/mypage/userAnswer/cancel.json`은 성공 케이스에서 아래 응답을 반환한다.

```json
{
  "resultCode": "success",
  "cancelAt": "Y"
}
```

24시간 이내 취소 불가 케이스는 아래 응답을 반환하거나 UI에서 사전에 차단된다.

```json
{
  "resultCode": "success",
  "cancelAt": "N"
}
```

## 목록 필터 fixture

목록 필터 검증을 위해 mock 목록 페이지에는 사이트 기본 필터를 표현하는 폼 또는 링크가 필요하다.

- 전체
- 접수중
- 마감

fixture는 기본 필터 적용 후에도 확장 날짜 필터의 `scdate`, `ecdate`가 보존되는지 확인할 수 있어야 한다.

## Calendar 상태 fixture

실제 Calendar 검증 모드에서는 Calendar를 목업하지 않는다. 대신 테스트 준비 단계에서 Calendar 상태를 아래처럼 만든다.

- 신청 상태 특강의 Calendar 일정과 특강-캘린더 연결 정보를 모두 제거한 상태
- 특강-캘린더 연결 정보는 있지만 실제 Calendar 일정만 삭제된 상태
- 취소 상태 특강의 Calendar 일정이 남아 있는 상태
- 신청/취소 양쪽에 잡힌 특강의 Calendar 일정이 존재하거나 누락된 상태
