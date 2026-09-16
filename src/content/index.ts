import { CONSENT_VERSION, MIN_TEXT } from "../shared/types";
import type { Analysis, PublicSettings } from "../shared/types";
import { send } from "../shared/messaging";
import { extractPage } from "./extract";
import { Highlights } from "./highlights";
import { Panel } from "./panel";

export function mount(): (() => void) | undefined {
  if (window.top !== window || document.getElementById("trustlight-host"))
    return;
  let settings: PublicSettings | null = null;
  let requestId: string | null = null;
  let generation = 0;
  let url = location.href;
  let disposed = false;
  let observer: MutationObserver | null = null;
  const highlights = new Highlights();
  function cancel(): void {
    const previous = requestId;
    requestId = null;
    generation++;
    if (previous)
      void send({ type: "CANCEL", requestId: previous }, 5000).catch(() => {});
  }
  function reset(): void {
    cancel();
    observer?.disconnect();
    observer = null;
    highlights.clear();
    panel.idle();
  }
  async function analyze(): Promise<void> {
    if (requestId || disposed) return;
    if (
      !settings?.enabled ||
      !settings.hasApiKey ||
      settings.consentVersion !== CONSENT_VERSION
    ) {
      panel.idle();
      return;
    }
    reset();
    const current = ++generation;
    const capturedUrl = location.href;
    const id = crypto.randomUUID();
    requestId = id;
    panel.busy();
    try {
      const extracted = extractPage(document);
      if (extracted.page.text.length < MIN_TEXT)
        throw new Error(
          "분석할 본문이 충분하지 않아요. 글이 있는 페이지에서 시도해 주세요.",
        );
      const result = await send<Analysis>({
        type: "ANALYZE",
        requestId: id,
        page: extracted.page,
      });
      if (disposed || generation !== current || capturedUrl !== location.href)
        return;
      panel.result(result);
      highlights.show(result, extracted);
      observer = new MutationObserver((records) => {
        const changed = records.some(
          (record) =>
            !(
              record.target instanceof Element
                ? record.target
                : record.target.parentElement
            )?.closest("[data-trustlight]") &&
            !(
              record.type === "childList" &&
              [...record.addedNodes, ...record.removedNodes].every(
                (node) =>
                  node instanceof Element &&
                  node.hasAttribute("data-trustlight"),
              )
            ),
        );
        if (changed) {
          highlights.clear();
          observer?.disconnect();
          observer = null;
          panel.notice(
            "본문이 바뀌었어요. 아래 결과는 이전 본문 기준이에요. 다시 분석해 주세요.",
          );
        }
      });
      observer.observe(extracted.root, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    } catch (error) {
      if (
        !disposed &&
        generation === current &&
        capturedUrl === location.href
      ) {
        void send({ type: "CANCEL", requestId: id }, 5000).catch(() => {});
        panel.error(
          error instanceof Error ? error.message : "분석을 완료하지 못했어요.",
        );
      }
    } finally {
      if (requestId === id) requestId = null;
    }
  }
  const panel = new Panel({
    analyze: () => {
      void analyze();
    },
    cancel: reset,
    options: () => {
      void send({ type: "OPEN_OPTIONS" }, 5000).catch((error) =>
        panel.error(error.message),
      );
    },
    select: (id) => {
      if (!highlights.select(id))
        panel.notice(
          "본문이 바뀌었거나 문장을 찾을 수 없어요. 다시 분석해 주세요.",
        );
    },
    position: (position) => {
      void send({ type: "SET_POSITION", position }, 5000).catch(() => {});
    },
  });
  panel.host.style.setProperty("display", "none", "important");
  const applySettings = (next: PublicSettings) => {
    if (disposed) return;
    settings = next;
    panel.configure(next);
    reset();
  };
  void send<PublicSettings>({ type: "GET_SETTINGS" }, 5000)
    .then(applySettings)
    .catch(() => dispose());
  function onMessage(
    message: { type?: string; settings?: PublicSettings },
    sender: chrome.runtime.MessageSender,
  ): void {
    if (
      sender.id === chrome.runtime.id &&
      message?.type === "SETTINGS_CHANGED" &&
      message.settings
    )
      applySettings(message.settings);
  }
  chrome.runtime.onMessage.addListener(onMessage);
  function navigation(): void {
    if (location.href !== url) {
      url = location.href;
      reset();
    }
  }
  // Observe pushState without injecting code into the host page.
  const interval = window.setInterval(() => {
    if (!document.hidden) navigation();
  }, 1000);
  window.addEventListener("popstate", navigation);
  window.addEventListener("hashchange", navigation);
  function pagehide(): void {
    reset();
  }
  function pageshow(): void {
    navigation();
  }
  window.addEventListener("pagehide", pagehide);
  window.addEventListener("pageshow", pageshow);
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    reset();
    window.clearInterval(interval);
    window.removeEventListener("popstate", navigation);
    window.removeEventListener("hashchange", navigation);
    window.removeEventListener("pagehide", pagehide);
    window.removeEventListener("pageshow", pageshow);
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch {
      /* Extension may have been updated. */
    }
    panel.destroy();
  }
  return dispose;
}
if (typeof chrome !== "undefined" && chrome.runtime?.id) mount();
