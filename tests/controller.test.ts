import test from "node:test";
import assert from "node:assert/strict";
import { AnalysisController } from "../src/background/controller";
import type { Analysis, PublicSettings } from "../src/shared/types";

const settings: PublicSettings = {
  enabled: true,
  panelSide: "left",
  consentVersion: 1,
  position: null,
  hasApiKey: true,
};
const result: Analysis = {
  reliability: 80,
  level: "good",
  biases: [],
  summary: "양호",
  findings: [],
  model: "test",
  analyzedChars: 100,
  truncated: false,
  durationMs: 1,
};
const sender = {
  tab: { id: 1 },
  documentId: "doc-1",
} as chrome.runtime.MessageSender;
const request = {
  type: "ANALYZE" as const,
  requestId: "request-1",
  page: { title: "", text: "본문".repeat(50), truncated: false },
};
test("reserves concurrency before async settings/key reads", async () => {
  let release!: (value: PublicSettings) => void;
  const deferred = new Promise<PublicSettings>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const controller = new AnalysisController({
    readSettings: () => deferred,
    readKey: async () => "fake",
    analyze: async () => {
      calls++;
      return result;
    },
  });
  const first = controller.run(request, sender);
  await assert.rejects(controller.run(request, sender), /이미/);
  release(settings);
  await first;
  assert.equal(calls, 1);
});
test("requires explicit consent and enabled state before network work", async () => {
  for (const update of [{ enabled: false }, { consentVersion: 0 }]) {
    let calls = 0;
    const controller = new AnalysisController({
      readSettings: async () => ({ ...settings, ...update }),
      readKey: async () => "fake",
      analyze: async () => {
        calls++;
        return result;
      },
    });
    await assert.rejects(controller.run(request, sender));
    assert.equal(calls, 0);
  }
});
test("cancellation aborts only the matching request/document and drops stale results", async () => {
  let finish!: (result: Analysis) => void;
  let signal: AbortSignal | undefined;
  const controller = new AnalysisController({
    readSettings: async () => settings,
    readKey: async () => "fake",
    analyze: async (_page, _key, value) => {
      signal = value;
      return new Promise<Analysis>((resolve) => {
        finish = resolve;
      });
    },
  });
  const pending = controller.run(request, sender);
  await new Promise((resolve) => setImmediate(resolve));
  controller.cancel(1, "wrong", "doc-1");
  assert.equal(signal?.aborted, false);
  controller.cancel(1, "request-1", "wrong-document");
  assert.equal(signal?.aborted, false);
  controller.cancel(1, "request-1", "doc-1");
  assert.equal(signal?.aborted, true);
  finish(result);
  await assert.rejects(pending, /취소/);
});
test("global concurrency is bounded and tab cleanup frees resources", async () => {
  const controller = new AnalysisController({
    readSettings: async () => settings,
    readKey: async () => "fake",
    analyze: async (_page, _key, signal) =>
      new Promise<Analysis>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("cancel")), {
          once: true,
        });
      }),
  });
  const one = controller.run(request, sender);
  const two = controller.run(request, {
    ...sender,
    tab: { id: 2 },
  } as chrome.runtime.MessageSender);
  await assert.rejects(
    controller.run(request, {
      ...sender,
      tab: { id: 3 },
    } as chrome.runtime.MessageSender),
    /다른 페이지/,
  );
  await new Promise((resolve) => setImmediate(resolve));
  const settled = Promise.allSettled([one, two]);
  controller.forget(1);
  controller.cancelAll();
  assert.deepEqual(
    (await settled).map((value) => value.status),
    ["rejected", "rejected"],
  );
});
