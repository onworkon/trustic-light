import { publicError } from "../shared/types";
import { controller, dispatch } from "./controller";
import { initializeStorage } from "./settings";
import { validateRequest } from "./validation";

// Register listeners synchronously so Chrome can wake a suspended worker.
const ready = initializeStorage().then(
  () => true,
  () => false,
);
chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse) => {
    void (async () => {
      try {
        const request = validateRequest(message, sender);
        if (!(await ready)) throw new Error("Storage initialization failed");
        sendResponse({ ok: true, data: await dispatch(request, sender) });
      } catch (error) {
        sendResponse({ ok: false, error: publicError(error) });
      }
    })().catch(() => {
      /* The sender may disappear while a response is in flight. */
    });
    return true;
  },
);
chrome.tabs.onRemoved.addListener((tabId) => controller.forget(tabId));
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "loading") controller.cancel(tabId);
});
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage().catch(() => {});
});
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install")
    void chrome.runtime.openOptionsPage().catch(() => {});
});
