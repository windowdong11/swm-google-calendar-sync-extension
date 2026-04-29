"use strict";

/**
 * Page Object: SoMA 특강 상세 (https://swmaestro.ai/sw/mypage/mentoLec/view.do)
 *
 * 향후 spec 06(detail polling)·spec 10(watchlist) 시나리오에서 사용.
 * 현재는 stub.
 */
class DetailPage {
  constructor(page) {
    this.page = page;
  }

  baseUrl() {
    return "https://swmaestro.ai/sw/mypage/mentoLec/view.do";
  }

  async open(qustnrSn) {
    const url = qustnrSn ? `${this.baseUrl()}?qustnrSn=${qustnrSn}` : this.baseUrl();
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    return this;
  }

  group() {
    return this.page.locator(".bbs-view-new .group");
  }
}

module.exports = { DetailPage };
