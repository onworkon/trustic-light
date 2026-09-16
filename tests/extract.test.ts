import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { extractPage } from "../src/content/extract";
import { MAX_TEXT } from "../src/shared/types";

test("extracts visible article text and excludes sensitive/editable/hidden regions", () => {
  const dom = new JSDOM(
    '<title>제목</title><nav>메뉴</nav><article><p>보이는 본문이에요.</p><form>이름과 이메일<input value="비밀번호" /></form><div contenteditable>작성 중 비밀</div><div hidden>숨김</div><div style="display:none">숨김2</div><div aria-hidden="true">숨김3</div><div data-private>개인 정보</div><p>다음 문장이에요.</p></article><footer>꼬리말</footer>',
  );
  try {
    const { page } = extractPage(dom.window.document);
    assert.equal(page.text, "보이는 본문이에요. 다음 문장이에요.");
    assert.equal(page.title, "제목");
  } finally {
    dom.window.close();
  }
});
test("quote matching spans inline elements without altering the page DOM", () => {
  const dom = new JSDOM(
    "<article><p>우리는 <strong>모든 사람</strong>을 존중합니다.</p><p>다음 문장</p></article>",
  );
  try {
    const before = dom.window.document.body.innerHTML;
    const extracted = extractPage(dom.window.document);
    assert.equal(
      extracted.findRange("모든 사람을 존중합니다.")?.toString(),
      "모든 사람을 존중합니다.",
    );
    assert.equal(extracted.findRange("없는 문장"), null);
    assert.equal(dom.window.document.body.innerHTML, before);
    dom.window.document.querySelector("strong")!.textContent = "변경";
    assert.equal(extracted.findRange("모든 사람을 존중합니다."), null);
  } finally {
    dom.window.close();
  }
});
test("long articles are bounded before crossing the extension boundary", () => {
  const dom = new JSDOM(`<main>${"가".repeat(MAX_TEXT)}😀끝</main>`);
  try {
    const { page } = extractPage(dom.window.document);
    assert.equal(page.text.length, MAX_TEXT);
    assert.equal(page.truncated, true);
  } finally {
    dom.window.close();
  }
});
test("falls back to body and ignores the extension host", () => {
  const dom = new JSDOM(
    "<div>일반 본문</div><div data-trustlight>분석 결과</div>",
  );
  try {
    assert.equal(extractPage(dom.window.document).page.text, "일반 본문");
  } finally {
    dom.window.close();
  }
});

test("a large hidden article cannot displace the visible article", () => {
  const dom = new JSDOM(
    `<article style="display:none">${"숨은 글".repeat(100)}</article><article><p>실제로 보이는 기사</p></article>`,
  );
  try {
    assert.equal(
      extractPage(dom.window.document).page.text,
      "실제로 보이는 기사",
    );
  } finally {
    dom.window.close();
  }
});
