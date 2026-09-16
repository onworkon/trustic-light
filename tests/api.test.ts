import test from "node:test";
import assert from "node:assert/strict";
import {
  analyze,
  parseStream,
  readBounded,
  testKey,
} from "../src/background/api";
import { MODEL } from "../src/shared/types";

function sse(events: unknown[]) {
  return events.map((value) => `data: ${JSON.stringify(value)}\n\n`).join("");
}
const events = [
  { type: "message_start", message: { model: MODEL } },
  {
    type: "content_block_delta",
    delta: { type: "text_delta", text: '{"reliability":80,' },
  },
  {
    type: "content_block_delta",
    delta: {
      type: "text_delta",
      text: '"summary":"좋아요","biases":[],"findings":[]}',
    },
  },
  { type: "message_delta", delta: { stop_reason: "end_turn" } },
  { type: "message_stop" },
];
test("parses multiple SSE chunks, CRLF and ping events", () => {
  const result = parseStream(
    sse([...events, { type: "ping" }]).replaceAll("\n", "\r\n"),
  );
  assert.equal(result.model, MODEL);
  assert.equal(JSON.parse(result.text).reliability, 80);
});
test("fails closed on truncated, refused, invalid and error streams", () => {
  assert.throws(() => parseStream(sse(events.slice(0, 3))));
  assert.throws(() =>
    parseStream(
      sse([{ type: "error", error: { message: "private upstream text" } }]),
    ),
  );
  assert.throws(() => parseStream("data: not-json\n\n"));
  assert.throws(() =>
    parseStream(
      sse([
        ...events.slice(0, 3),
        { type: "message_delta", delta: { stop_reason: "refusal" } },
        events[4],
      ]),
    ),
  );
});
test("limits streamed response bytes", async () => {
  await assert.rejects(
    readBounded(new Response("x".repeat(256_001))),
    /허용 크기/,
  );
  assert.equal(await readBounded(new Response("한글 본문")), "한글 본문");
});
test("sends credentials only to fixed API URL with no cookies or redirects", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls++;
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    assert.equal(init.referrerPolicy, "no-referrer");
    return new Response(sse(events));
  });
  const result = await analyze(
    { title: "제목", text: "본문 문장 ".repeat(20), truncated: true },
    "test-credential",
    new AbortController().signal,
  );
  assert.equal(result.reliability, 80);
  assert.equal(result.truncated, true);
  assert.equal(calls, 1);
});
test("HTTP errors do not disclose upstream response or retry paid requests", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("secret-upstream-error", { status: 401 });
  });
  await assert.rejects(
    testKey("fake-key"),
    (error) =>
      error instanceof Error &&
      error.message.includes("유효하지") &&
      !error.message.includes("secret"),
  );
  assert.equal(calls, 1);
});
test("cancellation aborts the actual transport", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
  );
  const controller = new AbortController();
  const pending = analyze(
    { title: "", text: "본문".repeat(50), truncated: false },
    "fake",
    controller.signal,
  );
  controller.abort();
  await assert.rejects(pending, /취소/);
});
