# SOMA Schedule Helper

소마 특강 목록 페이지에서 접수중 특강을 읽고, Google Calendar와 비교해 아래 3가지 상태로 표시하는 크롬 확장프로그램입니다.

- 겹침
- 이전 스케줄과 연달아 이어짐
- 겹치지 않음

## 포함 기능

- 소마 목록 페이지 자동 파싱
- 상단 요약 바
- 상태별 배지 표시
- 겹치는 일정 패널
- Google Calendar 일정 열기
- 옵션 페이지에서 `N분` 기준 조정
- 옵션에 따라 겹치는 일정 직접 삭제

## 가장 중요한 점

이 프로젝트는 **빌드 없이 바로 압축해제 후 로드 가능한 unpacked extension** 구조입니다.

스토어 배포용 ZIP은 `node scripts/build-release.mjs` 로 만들 수 있습니다.
Google Calendar OAuth는 여전히 필수이며, 배포 전에 Chrome Extension OAuth client ID를 확정해야 합니다.

## 빠른 사용 순서

1. Google Cloud Console에서 OAuth Client를 반드시 `Chrome Extension` 타입으로 생성
2. 확장 프로그램의 item ID에 현재 확장 ID를 등록
3. 로컬 테스트는 `manifest.json`의 `oauth2.client_id`를 교체하거나, 배포용 ZIP 생성 시 `--oauth-client-id` 옵션을 사용
4. Chrome `chrome://extensions` 열기
5. 개발자 모드 켜기
6. 이 폴더를 압축해제한 뒤 `압축해제된 확장 프로그램 로드`
7. 소마 특강 목록 페이지 열기
8. 처음 한 번 Google Calendar 권한 허용

## 배포용 ZIP 만들기

현재 버전 기준 업로드용 ZIP 생성:

```bash
node scripts/build-release.mjs --oauth-client-id='YOUR_CHROME_EXTENSION_CLIENT_ID'
```

생성 결과:

- `dist/soma-schedule-helper-v<version>.zip`
- 기본값으로 ZIP 안에서는 `manifest.key` 제거
- 콘솔에 현재 소스 기준 local extension ID 출력

신규 Chrome Web Store 등록이라면 이 ZIP으로 먼저 업로드합니다.
대시보드에서 item ID와 public key를 확인한 뒤, 그 public key를 다시 로컬 `manifest.json`의 `key`로 넣어야
개발용 unpacked 확장 ID와 스토어 ID를 일치시킬 수 있습니다.

이미 스토어 item이 있고, 업로드 ZIP에도 `manifest.key`를 유지하고 싶다면:

```bash
node scripts/build-release.mjs --include-key --oauth-client-id='YOUR_CHROME_EXTENSION_CLIENT_ID'
```

## Chrome Web Store 업로드 체크리스트

1. `manifest.json`의 `version`을 새 버전으로 올립니다.
2. 첫 등록이라면 `node scripts/build-release.mjs` 로 `key` 없는 ZIP을 생성해 Chrome Web Store에 업로드합니다.
3. 대시보드의 item ID와 public key를 확인합니다.
4. 로컬 `manifest.json`의 `key`를 대시보드 public key로 교체합니다.
5. Google Cloud Console에서 Chrome Extension OAuth client를 만들고 item ID에 대시보드 item ID를 등록합니다.
6. `node scripts/build-release.mjs --oauth-client-id='...'` 로 최종 ZIP을 다시 생성합니다.
7. 권한/데이터 사용 설명과 개인정보처리방침 URL을 입력합니다.

개인정보처리방침 초안은 `docs/privacy-policy-template.md` 에 넣어두었습니다.

## 이 에러가 뜰 때

`오류 400: invalid_request` 와 `Custom URI scheme is not supported on Chrome apps.` 는
대부분 현재 브라우저가 Chrome이 아니거나, OAuth client ID 타입이 잘못되었거나,
Chrome Extension client의 item ID가 현재 확장 ID와 다를 때 발생합니다.

이 프로젝트는 `chrome.identity.getAuthToken()`을 사용하므로
Google Cloud Console에 현재 확장 프로그램용 `Chrome Extension` OAuth 클라이언트를 정확히 등록해야 합니다.

## 브라우저 호환성

- Google Chrome: 지원
- Arc / Brave / Edge 등 비Chrome Chromium 브라우저: Google OAuth 연결이 실패할 수 있음

Arc 같은 브라우저도 Chromium 기반이지만, Google의 Chrome Extension OAuth 흐름은
`chrome.identity.getAuthToken()`에서 Chrome에 더 강하게 의존합니다.

## 파일 구조

- `icons/image.png`
- `manifest.json`
- `src/background/service-worker.js`
- `src/content/content.js`
- `src/content/styles.css`
- `src/options/options.html`
- `src/options/options.js`

## 현실적인 한계

완전한 "딸깍 한 번"은 불가능합니다.
이유는 Google Calendar의 개인 일정 접근에 OAuth 설정이 필수이기 때문입니다.

이 ZIP은 그 수동 작업을 **OAuth client_id 1회 입력**까지로 줄인 버전입니다.
