"use strict";

/**
 * Page Object: SoMA 특강 목록 (https://swmaestro.ai/sw/mypage/mentoLec/list.do)
 *
 * 향후 spec 02·03·04(분류·필터링) 시나리오에서 사용.
 * 현재는 stub. 셀렉터는 tests/fixtures/site-current/list.html과
 * src/content/parsers.js를 보고 채운다.
 */
class ListPage {
  constructor(page) {
    this.page = page;
  }

  url() {
    return "https://swmaestro.ai/sw/mypage/mentoLec/list.do";
  }

  async open() {
    await this.page.goto(this.url(), { waitUntil: "domcontentloaded" });
    return this;
  }

  rows() {
    return this.page.locator(".boardlist tbody tr");
  }
}

module.exports = { ListPage };
