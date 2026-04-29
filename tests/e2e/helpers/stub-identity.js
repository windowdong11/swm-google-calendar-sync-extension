"use strict";

/**
 * chrome.identity.getAuthToken / removeCachedAuthToken을 SW context에서
 * 가짜 토큰을 즉시 반환하도록 monkey-patch한다.
 *
 * service-worker.js:159는 `await chrome.identity.getAuthToken({ interactive })`
 * 형태로 promise API를 사용. callback API도 함께 지원해 안전.
 *
 * Manifest V3 chrome.identity.getAuthToken는 result 객체 또는 string 토큰을
 * 반환할 수 있어 service-worker.js의 extractToken()이 양쪽 형태를 모두 받는다.
 */

const FAKE_TOKEN = "fake-test-token";

async function stubIdentity(ctx, opts = {}) {
  const token = opts.token || FAKE_TOKEN;
  let sw = ctx.serviceWorkers()[0];
  if (!sw) {
    const { wakeSw } = require("./sw");
    sw = await wakeSw(ctx);
  }
  await sw.evaluate((t) => {
    chrome.identity.getAuthToken = (opts, cb) => {
      const value = { token: t };
      if (typeof cb === "function") {
        cb(t);
        return undefined;
      }
      if (typeof opts === "function") {
        opts(t);
        return undefined;
      }
      return Promise.resolve(value);
    };
    chrome.identity.removeCachedAuthToken = (_opts, cb) => {
      if (typeof cb === "function") cb();
      return Promise.resolve();
    };
  }, token);
}

async function stubIdentityFailure(ctx, errorMessage = "OAuth not granted") {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) {
    const { wakeSw } = require("./sw");
    sw = await wakeSw(ctx);
  }
  await sw.evaluate((msg) => {
    chrome.identity.getAuthToken = (_opts, cb) => {
      if (typeof cb === "function") {
        chrome.runtime.lastError = { message: msg };
        cb(undefined);
        return undefined;
      }
      return Promise.reject(new Error(msg));
    };
  }, errorMessage);
}

module.exports = { stubIdentity, stubIdentityFailure, FAKE_TOKEN };
