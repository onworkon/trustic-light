import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import type { Request } from "../src/shared/types";

const bundled = await build({
  entryPoints: ["src/content/index.ts"],
  bundle: true,
  format: "iife",
  write: false,
  loader: { ".css": "text" },
});
const code = bundled.outputFiles[0]!.text;
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(
  analyze: (request: Request) => Promise<unknown> = async () => ({
    ok: false,
    error: "시험 오류",
  }),
) {
  let shadow: ShadowRoot;
  const messages: Request[] = [];
  const callbacks = new Set<(message: unknown, sender: unknown) => void>();
  const settings = {
    enabled: true,
    consentVersion: 1,
    hasApiKey: true,
    panelSide: "left",
    position: null,
  };
  const dom = new JSDOM(
    `<title>테스트 기사</title><article><p>${"충분한 길이의 본문입니다. ".repeat(20)}</p></article>`,
    {
      url: "https://example.test/article",
      runScripts: "outside-only",
      pretendToBeVisual: true,
      beforeParse(window) {
        const attach = window.Element.prototype.attachShadow;
        window.Element.prototype.attachShadow = function (init) {
          shadow = attach.call(this, init) as unknown as ShadowRoot;
          return shadow as never;
        };
        Object.assign(window, {
          CSS: { highlights: new Map() },
          chrome: {
            runtime: {
              id: "fixture",
              onMessage: {
                addListener: (
                  callback: (message: unknown, sender: unknown) => void,
                ) => callbacks.add(callback),
                removeListener: (
                  callback: (message: unknown, sender: unknown) => void,
                ) => callbacks.delete(callback),
              },
              async sendMessage(request: Request) {
                messages.push(request);
                if (request.type === "GET_SETTINGS")
                  return { ok: true, data: settings };
                if (request.type === "ANALYZE") return analyze(request);
                return { ok: true, data: null };
              },
            },
          },
        });
      },
    },
  );
  dom.window.eval(code);
  function button(text: string): HTMLButtonElement {
    const button = [...shadow.querySelectorAll("button")].find(
      (node) => node.textContent === text,
    );
    assert.ok(button, `Button not found: ${text}`);
    return button;
  }
  return { dom, messages, settings, callbacks, button, shadow: () => shadow };
}
test("loading and opening the widget never automatically transmit article text", async () => {
  const page = fixture();
  try {
    await tick();
    page.shadow().querySelector<HTMLButtonElement>(".light")!.click();
    assert.equal(
      page.messages.filter((message) => message.type === "ANALYZE").length,
      0,
    );
    page.button("이 글 분석하기").click();
    await tick();
    assert.equal(
      page.messages.filter((message) => message.type === "ANALYZE").length,
      1,
    );
    assert.match(page.shadow().textContent!, /시험 오류/);
  } finally {
    page.dom.window.close();
  }
});
test("cancel clears the UI and ignores a late successful response", async () => {
  let resolve!: (result: unknown) => void;
  const page = fixture(
    async () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  try {
    await tick();
    page.button("이 글 분석하기").click();
    await tick();
    page.button("분석 취소").click();
    await tick();
    assert.equal(
      page.messages.filter((message) => message.type === "CANCEL").length,
      1,
    );
    resolve({
      ok: true,
      data: { summary: "절대 표시되면 안 되는 오래된 결과" },
    });
    await tick();
    assert.doesNotMatch(page.shadow().textContent!, /절대 표시되면/);
    assert.ok(page.button("이 글 분석하기"));
  } finally {
    page.dom.window.close();
  }
});
test("navigation cancels pending analysis and discards stale results", async () => {
  let resolve!: (result: unknown) => void;
  const page = fixture(
    async () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  try {
    await tick();
    page.button("이 글 분석하기").click();
    await tick();
    page.dom.window.history.pushState({}, "", "/different");
    page.dom.window.dispatchEvent(
      new page.dom.window.PopStateEvent("popstate"),
    );
    await tick();
    assert.equal(
      page.messages.filter((message) => message.type === "CANCEL").length,
      1,
    );
    resolve({ ok: true, data: { summary: "이전 페이지 결과" } });
    await tick();
    assert.doesNotMatch(page.shadow().textContent!, /이전 페이지 결과/);
  } finally {
    page.dom.window.close();
  }
});
test("disabling the extension hides it and aborts pending analysis", async () => {
  let resolve!: (result: unknown) => void;
  const page = fixture(
    async () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  try {
    await tick();
    page.button("이 글 분석하기").click();
    await tick();
    for (const callback of page.callbacks)
      callback(
        {
          type: "SETTINGS_CHANGED",
          settings: { ...page.settings, enabled: false },
        },
        { id: "fixture" },
      );
    assert.equal(
      page.dom.window.document.getElementById("trustlight-host")!.style.display,
      "none",
    );
    assert.equal(
      page.messages.filter((message) => message.type === "CANCEL").length,
      1,
    );
    resolve({ ok: false, error: "취소" });
    await tick();
  } finally {
    page.dom.window.close();
  }
});

test("model output is rendered as text and cannot insert executable markup", async () => {
  const payload = '<img src=x onerror="alert(1)">';
  const page = fixture(async () => ({
    ok: true,
    data: {
      reliability: 70,
      level: "good",
      biases: [],
      summary: payload,
      findings: [
        {
          id: "f1",
          quote: payload,
          explanation: payload,
          bias: "source",
          severity: 1,
        },
      ],
      model: "test",
      analyzedChars: 100,
      truncated: false,
      durationMs: 1,
    },
  }));
  try {
    await tick();
    page.button("이 글 분석하기").click();
    await tick();
    assert.ok(
      page.shadow().querySelector(".status")!.textContent!.includes(payload),
    );
    assert.equal(page.shadow().querySelectorAll("img,iframe,script").length, 0);
  } finally {
    page.dom.window.close();
  }
});
