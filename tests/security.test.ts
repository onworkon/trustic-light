import test from "node:test";
import assert from "node:assert/strict";
import { validateRequest } from "../src/background/validation";
import {
  initializeStorage,
  readSettings,
  readKey,
  saveSettings,
  normalizeSettings,
} from "../src/background/settings";

const extensionId = "test-extension-id";
const optionsSender = {
  id: extensionId,
  url: `chrome-extension://${extensionId}/options.html`,
};
const pageSender = {
  id: extensionId,
  url: "https://example.test/article",
  frameId: 0,
  tab: { id: 1 },
} as chrome.runtime.MessageSender;
function mockChrome(data: Record<string, unknown> = {}) {
  const order: string[] = [];
  const runtime = {
    id: extensionId,
    getURL: (path: string) => `chrome-extension://${extensionId}/${path}`,
  };
  const local = {
    async setAccessLevel(value: unknown) {
      order.push("restrict");
      assert.deepEqual(value, { accessLevel: "TRUSTED_CONTEXTS" });
    },
    async get(keys: string | string[]) {
      order.push("get");
      return Object.fromEntries(
        (typeof keys === "string" ? [keys] : keys).map((key) => [
          key,
          data[key],
        ]),
      );
    },
    async set(values: Record<string, unknown>) {
      Object.assign(data, values);
    },
    async remove(keys: string[]) {
      for (const key of keys) delete data[key];
    },
  };
  Object.assign(globalThis, { chrome: { runtime, storage: { local } } });
  return { data, order };
}
test("only own top-level content scripts can request analysis", () => {
  mockChrome();
  const request = {
    type: "ANALYZE",
    requestId: "r-1",
    page: { title: "", text: "본문".repeat(50), truncated: false },
  };
  assert.equal(validateRequest(request, pageSender).type, "ANALYZE");
  for (const sender of [
    optionsSender,
    { ...pageSender, id: "other-extension" },
    { ...pageSender, frameId: 1 },
    { ...pageSender, url: "file:///private" },
    {},
  ])
    assert.throws(() => validateRequest(request, sender));
  assert.throws(() =>
    validateRequest(
      { ...request, page: { ...request.page, text: "x".repeat(9001) } },
      pageSender,
    ),
  );
});
test("settings and key tests cannot be invoked by a page or another extension", () => {
  mockChrome();
  assert.throws(() =>
    validateRequest({ type: "TEST_API_KEY", apiKey: "fake" }, pageSender),
  );
  assert.throws(() =>
    validateRequest({ type: "SAVE_SETTINGS", settings: {} }, pageSender),
  );
  assert.equal(
    validateRequest({ type: "TEST_API_KEY" }, optionsSender).type,
    "TEST_API_KEY",
  );
  assert.throws(() =>
    validateRequest(
      { type: "GET_SETTINGS" },
      { ...optionsSender, url: `${optionsSender.url}.evil` },
    ),
  );
  assert.throws(() =>
    validateRequest({ type: "SET_POSITION", position: NaN }, pageSender),
  );
});
test("restricts storage first and never migrates a bundled developer key", async () => {
  const { data, order } = mockChrome({
    "trustlight.settings": {
      apiKey: "sk-ant-" + "x".repeat(30),
      enabled: false,
      panelSide: "right",
    },
    "trustlight.credentialRevision": "legacy",
    "trustlight.lightPosition": 0.4,
  });
  await initializeStorage();
  assert.equal(order[0], "restrict");
  assert.equal(data["trustlight.settings"], undefined);
  assert.equal(data["trustlight.credentialRevision"], undefined);
  const settings = await readSettings();
  assert.equal(settings.hasApiKey, false);
  assert.equal(settings.enabled, false);
  assert.equal(settings.position, 0.4);
  assert.equal(settings.consentVersion, 0);
});
test("migrates personal credentials without exposing them in public settings", async () => {
  const key = "sk-ant-" + "x".repeat(30);
  mockChrome({ "trustlight.settings": { apiKey: key } });
  await initializeStorage();
  assert.equal(await readKey(), key);
  assert.equal(JSON.stringify(await readSettings()).includes(key), false);
  await saveSettings({
    enabled: true,
    panelSide: "left",
    consentVersion: 1,
    removeKey: true,
  });
  await assert.rejects(readKey());
});
test("invalid keys do not partially save settings and corrupt settings fail safely", async () => {
  mockChrome();
  await initializeStorage();
  await assert.rejects(
    saveSettings({
      enabled: false,
      panelSide: "right",
      consentVersion: 1,
      apiKey: "wrong",
    }),
  );
  assert.equal((await readSettings()).enabled, true);
  assert.equal(
    normalizeSettings({ consentVersion: 999, position: Infinity })
      .consentVersion,
    0,
  );
});
