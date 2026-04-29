"use strict";

/**
 * E2E 시나리오 전용 chrome.storage.local.lectureSnapshot.lectures seed.
 *
 * mock/mock-env.js의 DEFAULT_LECTURES와는 의도적으로 분리되어 있다 (mock-env.js는
 * IIFE라 require 불가, e2e 인프라가 mock-env.js 변경에 결합되면 안 됨).
 *
 * 시각은 영구 미래(2099)로 고정해 system clock drift로 인한 회귀 방지.
 * tests/fixtures/site-current/list.html의 fixture 시각 정책과 동일.
 */

const DEFAULT_LECTURES = [
  {
    qustnrSn: "e2e-lec-001",
    title: "[E2E] LLM Function Calling 실습",
    startAt: "2099-04-30T14:00:00+09:00",
    endAt:   "2099-04-30T16:00:00+09:00",
    url: "https://swmaestro.ai/sw/mypage/mentoLec/view.do?qustnrSn=e2e-lec-001",
    detailUrl: "https://swmaestro.ai/sw/mypage/mentoLec/view.do?qustnrSn=e2e-lec-001",
    capacity: 30,
    applyCnt: 5,
    applied: false,
    statusText: "신청 가능"
  },
  {
    qustnrSn: "e2e-lec-002",
    title: "[E2E] Chrome Extension 보안",
    startAt: "2099-05-01T19:00:00+09:00",
    endAt:   "2099-05-01T21:00:00+09:00",
    url: "https://swmaestro.ai/sw/mypage/mentoLec/view.do?qustnrSn=e2e-lec-002",
    detailUrl: "https://swmaestro.ai/sw/mypage/mentoLec/view.do?qustnrSn=e2e-lec-002",
    capacity: 20,
    applyCnt: 19,
    applied: false,
    statusText: "잔여 1자리"
  },
  {
    qustnrSn: "e2e-lec-003",
    title: "[E2E] 신청 완료 항목 (사이드 패널 제외 대상)",
    startAt: "2099-05-02T14:00:00+09:00",
    endAt:   "2099-05-02T16:00:00+09:00",
    url: "https://swmaestro.ai/sw/mypage/mentoLec/view.do?qustnrSn=e2e-lec-003",
    detailUrl: "https://swmaestro.ai/sw/mypage/mentoLec/view.do?qustnrSn=e2e-lec-003",
    capacity: 30,
    applyCnt: 30,
    applied: true,
    statusText: "신청 완료"
  }
];

function buildSnapshot(lectures = DEFAULT_LECTURES) {
  return {
    lectures,
    takenAt: new Date().toISOString(),
    sourceComplete: true
  };
}

module.exports = { DEFAULT_LECTURES, buildSnapshot };
