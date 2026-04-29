# tests/e2e/fixtures — E2E 자동 검증 fixture

## 목적

`tests/e2e/scenarios/*.spec.js`에서 page.route mock 응답·storage seed로 쓰는 데이터.

## 디렉토리 정책

| 위치 | 용도 | 누가 갱신 |
|---|---|---|
| `tests/e2e/fixtures/google-events.json` | Google Calendar API list 응답 흉내 | 시나리오에 새 케이스 필요 시 직접 |
| `tests/e2e/fixtures/lectures.js` | `chrome.storage.local.lectureSnapshot.lectures` seed | 시나리오에 새 케이스 필요 시 직접 |
| `tests/fixtures/site-current/*.html` | SoMA 사이트 HTML 캡처 (단위·E2E 공용) | `npm run refresh:fixtures` |
| `mock/mock-env.js` | 브라우저 수동 확인용 (E2E와 무관) | 수동 |

## 추가 컨벤션

새 fixture 추가 시:

1. **이름**: `<scope>-<purpose>.<ext>` — 예: `google-events-empty.json`, `lectures-conflict.js`
2. **시각**: 항상 미래 시각(2099 권장). 시스템 시계에 의존하지 말 것.
3. **민감 정보 금지**: 한글 이름·이메일·전화·UUID 토큰 등은 placeholder. `tests/fixtures/site-current/*` 갱신은 `npm run refresh:fixtures` 자동 마스킹 사용.
4. **lectures 추가**: `lectures.js`의 `DEFAULT_LECTURES` 배열에 항목 추가 또는 helper로 `buildSnapshot([custom])` 호출.
5. **Calendar 이벤트 추가**: `google-events.json`의 `items` 배열 확장. `start.dateTime`·`end.dateTime`는 KST(+09:00).

## 시나리오 추가 절차

`tests/e2e/AUTHORING.md` 참조.
