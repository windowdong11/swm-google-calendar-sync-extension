# SWM Schedule Helper

소프트웨어 마에스트로(SWM) 특강 페이지에서 특강 시간과 Google Calendar 일정을 비교하고, 신청한 특강을 캘린더와 동기화하는 Chrome 확장프로그램입니다.

빌드 없이 바로 `압축해제된 확장 프로그램`으로 로드할 수 있는 Manifest V3 프로젝트입니다.

## 주요 기능

- 특강 목록 페이지에서 날짜 범위를 지정해 조회
- 접수중 특강의 시간 파싱 및 Google Calendar 일정 비교
- 상태 배지 표시: 겹침, 바로 이어짐, 겹치지 않음, 시간 확인 필요
- 상태별 필터와 요약 바 제공
- 겹치는 일정 패널에서 Google Calendar 일정 열기
- 특강 상세 페이지에서 신청 전 겹침 여부 표시
- 특강 신청 성공 시 Google Calendar 일정 생성 또는 갱신
- 특강 취소 시 연결된 Google Calendar 일정 삭제
- 접수내역 페이지 기준으로 신청 완료/삭제된 특강을 Google Calendar와 재동기화
- 옵션 페이지에서 바로 이어짐 기준, transparent 일정 포함 여부, 직접 삭제 버튼 표시 여부 설정

## 동작 페이지

확장 프로그램은 아래 SWM 페이지에서만 실행됩니다.

- 특강 목록: `https://swmaestro.ai/sw/mypage/mentoLec/list.do*`, `https://www.swmaestro.ai/sw/mypage/mentoLec/list.do*`
- 특강 상세/신청: `https://swmaestro.ai/sw/mypage/mentoLec/view.do*`, `https://www.swmaestro.ai/sw/mypage/mentoLec/view.do*`
- 접수내역: `https://swmaestro.ai/sw/mypage/userAnswer/history.do*`, `https://www.swmaestro.ai/sw/mypage/userAnswer/history.do*`

## 빠른 시작

1. Google Cloud Console에서 OAuth Client를 `Chrome Extension` 타입으로 생성합니다.
2. OAuth Client의 item ID에 현재 확장 프로그램 ID를 등록합니다.
3. 로컬 테스트는 `manifest.json`의 `oauth2.client_id`를 교체하거나, 배포 ZIP 생성 시 `--oauth-client-id` 옵션으로 주입합니다.
4. Chrome에서 `chrome://extensions`를 엽니다.
5. 개발자 모드를 켭니다.
6. 이 폴더를 `압축해제된 확장 프로그램 로드`로 선택합니다.
7. SWM 특강 목록, 상세, 접수내역 페이지를 엽니다.
8. 처음 한 번 Google Calendar 권한을 허용합니다.

## Google Calendar 권한

이 확장은 `chrome.identity.getAuthToken()`으로 Google OAuth 토큰을 받아 Google Calendar API를 호출합니다.

필요한 OAuth scope:

- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/calendar.events`

`calendar.readonly`는 일정 겹침 확인에 사용하고, `calendar.events`는 신청한 SWM 특강 일정을 생성, 갱신, 삭제하는 데 사용합니다.

## 설정

Chrome 확장 프로그램 상세 화면의 `확장 프로그램 옵션`에서 설정할 수 있습니다.

- 연달아 이어짐 기준: 기본값 `15분`, 범위 `0~120분`
- 겹침 일정에서 직접 삭제 버튼 표시: 기본값 꺼짐
- 삭제 전 확인창 띄우기: 기본값 켜짐
- transparent 일정도 비교에 포함: 기본값 꺼짐

현재 옵션 UI는 `primary` 캘린더를 사용합니다.

## 배포용 ZIP 만들기

현재 버전 기준 업로드용 ZIP을 생성합니다.

```bash
node scripts/build-release.mjs --oauth-client-id='YOUR_CHROME_EXTENSION_CLIENT_ID'
```

생성 결과:

- `dist/soma-schedule-helper-v<version>.zip`
- 기본값으로 ZIP 안에서는 `manifest.key` 제거
- 콘솔에 현재 소스 기준 local extension ID 출력

신규 Chrome Web Store 등록이라면 `manifest.key` 없는 ZIP으로 먼저 업로드합니다. 대시보드에서 item ID와 public key를 확인한 뒤, 그 public key를 다시 로컬 `manifest.json`의 `key`로 넣으면 개발용 unpacked 확장 ID와 스토어 ID를 일치시킬 수 있습니다.

이미 스토어 item이 있고 업로드 ZIP에도 `manifest.key`를 유지하고 싶다면 아래 옵션을 사용합니다.

```bash
node scripts/build-release.mjs --include-key --oauth-client-id='YOUR_CHROME_EXTENSION_CLIENT_ID'
```

출력 폴더를 바꾸려면 `--out-dir=...`를 추가합니다.

```bash
node scripts/build-release.mjs --out-dir=release --oauth-client-id='YOUR_CHROME_EXTENSION_CLIENT_ID'
```

## Chrome Web Store 업로드 체크리스트

1. `manifest.json`의 `version`을 새 버전으로 올립니다.
2. 첫 등록이라면 `node scripts/build-release.mjs --oauth-client-id='...'`로 `key` 없는 ZIP을 생성해 Chrome Web Store에 업로드합니다.
3. 대시보드의 item ID와 public key를 확인합니다.
4. 로컬 `manifest.json`의 `key`를 대시보드 public key로 교체합니다.
5. Google Cloud Console에서 Chrome Extension OAuth Client를 만들고 item ID에 대시보드 item ID를 등록합니다.
6. `node scripts/build-release.mjs --include-key --oauth-client-id='...'`로 최종 ZIP을 다시 생성합니다.
7. 권한/데이터 사용 설명과 개인정보처리방침 URL을 입력합니다.

개인정보처리방침 초안은 `docs/privacy-policy-template.md`에 있습니다.

## 파일 구조

```text
.
|-- manifest.json
|-- scripts/
|   `-- build-release.mjs
|-- src/
|   |-- background/
|   |   `-- service-worker.js
|   |-- content/
|   |   |-- apply.js
|   |   |-- content.js
|   |   |-- history.js
|   |   |-- lecture-status.js
|   |   `-- styles.css
|   `-- options/
|       |-- options.html
|       `-- options.js
|-- icons/
|   `-- image.png
|-- mock/
|-- example/
`-- docs/
```

## 개발 메모

- 별도 패키지 설치나 번들링 단계가 없습니다.
- `src/content/content.js`는 특강 목록 페이지 UI와 날짜 조회/필터/겹침 계산을 담당합니다.
- `src/content/apply.js`는 상세 페이지의 신청/취소 흐름과 Google Calendar 동기화를 담당합니다.
- `src/content/history.js`는 접수내역 전체 페이지를 읽어 Google Calendar와 맞춥니다.
- `src/content/lecture-status.js`는 시간 정규화, 상태 판정, 공통 UI 생성 로직을 담습니다.
- `src/background/service-worker.js`는 설정, OAuth, Google Calendar API 호출, SWM 특강 이벤트 매핑을 관리합니다.
- `mock/`와 `example/`은 공개 공유 및 수동 확인을 위한 비식별 fixture입니다.

## 문제 해결

### `오류 400: invalid_request`

대부분 OAuth Client 타입이 잘못되었거나, Google Cloud Console에 등록한 item ID가 현재 확장 프로그램 ID와 다를 때 발생합니다.

확인할 것:

- OAuth Client 타입이 `Chrome Extension`인지
- item ID가 `chrome://extensions`에 표시되는 현재 확장 프로그램 ID와 같은지
- 배포 ZIP 생성 시 올바른 `--oauth-client-id`를 넣었는지

### `Custom URI scheme is not supported on Chrome apps.`

Arc, Brave, Edge 같은 비Chrome Chromium 브라우저에서 발생할 수 있습니다. 이 확장은 `chrome.identity.getAuthToken()` 기반이라 Google Chrome에서 가장 안정적으로 동작합니다.

### 일정이 겹치지 않는 것처럼 보일 때

- Google Calendar 권한을 허용했는지 확인합니다.
- 옵션에서 transparent 일정 포함 여부를 확인합니다.
- 특강 시간이 사이트에서 파싱 가능한 형식인지 확인합니다. 파싱 실패 시 `시간 확인 필요` 배지가 표시됩니다.

### 신청/취소 후 캘린더가 맞지 않을 때

접수내역 페이지를 열어 `다시 동기화`를 실행합니다. 접수내역을 기준으로 활성 특강은 생성/갱신하고, 삭제되었거나 더 이상 접수중이 아닌 매핑은 정리합니다.

## 브라우저 호환성

- Google Chrome: 지원
- Arc / Brave / Edge 등 비Chrome Chromium 브라우저: Google OAuth 연결이 실패할 수 있음

## 한계

Google Calendar의 개인 일정 접근이 필요하므로 OAuth 설정 없이 완전한 원클릭 배포는 불가능합니다.

이 프로젝트는 수동 작업을 `Chrome Extension OAuth client_id` 설정과 Chrome Web Store item ID 등록으로 줄이는 것을 목표로 합니다.
