import { CONSENT_VERSION } from "../shared/types";
import type { PublicSettings } from "../shared/types";
import { send } from "../shared/messaging";

function get<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
}
const form = get<HTMLFormElement>("settings-form");
const fields = get<HTMLFieldSetElement>("fields");
const key = get<HTMLInputElement>("api-key");
const consent = get<HTMLInputElement>("consent");
const enabled = get<HTMLInputElement>("enabled");
const side = get<HTMLSelectElement>("panel-side");
const saveStatus = get("save-status");
const testStatus = get("test-status");
const testButton = get<HTMLButtonElement>("test-key");
const removeButton = get<HTMLButtonElement>("remove-key");
const showButton = get<HTMLButtonElement>("show-key");
let removeKey = false;
let dirty = false;
let hasApiKey = false;
let revision = 0;
let busy = false;
function status(node: HTMLElement, text: string, tone = ""): void {
  node.textContent = text;
  node.className = `help ${tone}`;
}
function apply(settings: PublicSettings): void {
  enabled.checked = settings.enabled;
  consent.checked = settings.consentVersion === CONSENT_VERSION;
  side.value = settings.panelSide;
  hasApiKey = settings.hasApiKey;
  removeKey = false;
  key.value = "";
  key.type = "password";
  showButton.textContent = "표시";
  showButton.setAttribute("aria-pressed", "false");
  get("key-state").textContent = settings.hasApiKey
    ? "API 키가 저장되어 있어요. 새 키를 입력하지 않으면 기존 키를 유지해요."
    : "저장된 API 키가 없어요.";
  removeButton.disabled = !settings.hasApiKey;
  dirty = false;
}
async function initialize(): Promise<void> {
  try {
    if (!chrome.runtime?.id)
      throw new Error("확장 프로그램 설정 페이지에서 열어 주세요.");
    get("version").textContent = `v${chrome.runtime.getManifest().version}`;
    apply(await send<PublicSettings>({ type: "GET_SETTINGS" }, 5000));
    fields.disabled = false;
  } catch {
    status(
      saveStatus,
      "설정을 불러오지 못했어요. 확장 프로그램을 다시 로드하고 이 페이지를 새로고침해 주세요.",
      "error",
    );
  }
}
form.addEventListener("input", () => {
  dirty = true;
  revision++;
  testStatus.textContent = "";
  status(saveStatus, "아직 저장하지 않은 변경 사항이 있어요.");
});
key.addEventListener("input", () => {
  removeKey = false;
});
showButton.addEventListener("click", () => {
  const show = key.type === "password";
  key.type = show ? "text" : "password";
  showButton.textContent = show ? "숨기기" : "표시";
  showButton.setAttribute("aria-pressed", String(show));
});
removeButton.addEventListener("click", () => {
  removeKey = true;
  dirty = true;
  revision++;
  key.value = "";
  get("key-state").textContent = "설정을 저장하면 API 키가 삭제돼요.";
  status(saveStatus, "API 키 삭제를 적용하려면 저장해 주세요.");
});
testButton.addEventListener("click", () => {
  if (busy) return;
  if ((!key.value.trim() && !hasApiKey) || removeKey) {
    status(testStatus, "API 키를 먼저 입력해 주세요.", "error");
    return;
  }
  const current = revision;
  busy = true;
  fields.disabled = true;
  status(testStatus, "연결을 확인하고 있어요. 본문은 전송하지 않아요.");
  void send<{ model: string; latencyMs: number }>(
    { type: "TEST_API_KEY", apiKey: key.value.trim() || undefined },
    25_000,
  )
    .then((result) => {
      if (revision === current)
        status(
          testStatus,
          `연결됐어요 · ${result.model} · ${result.latencyMs}ms`,
          "success",
        );
    })
    .catch((error) => {
      if (revision === current)
        status(
          testStatus,
          error instanceof Error ? error.message : "연결을 확인하지 못했어요.",
          "error",
        );
    })
    .finally(() => {
      busy = false;
      fields.disabled = false;
      removeButton.disabled = !hasApiKey;
    });
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  fields.disabled = true;
  status(saveStatus, "저장 중…");
  void send<PublicSettings>(
    {
      type: "SAVE_SETTINGS",
      settings: {
        enabled: enabled.checked,
        panelSide: side.value === "right" ? "right" : "left",
        consentVersion: consent.checked ? CONSENT_VERSION : 0,
        apiKey: key.value.trim() || undefined,
        removeKey,
      },
    },
    10_000,
  )
    .then((settings) => {
      apply(settings);
      status(saveStatus, "설정을 저장했어요.", "success");
    })
    .catch((error) =>
      status(
        saveStatus,
        error instanceof Error ? error.message : "설정을 저장하지 못했어요.",
        "error",
      ),
    )
    .finally(() => {
      busy = false;
      fields.disabled = false;
    });
});
window.addEventListener("beforeunload", (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
void initialize();
