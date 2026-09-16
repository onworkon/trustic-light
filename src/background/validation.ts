import {
  CONSENT_VERSION,
  MAX_TEXT,
  MIN_TEXT,
  UserError,
  isRecord,
} from "../shared/types";
import type { Request } from "../shared/types";

export function isOptionsSender(sender: chrome.runtime.MessageSender): boolean {
  return (
    sender.id === chrome.runtime.id &&
    sender.url === chrome.runtime.getURL("options.html")
  );
}
export function isPageSender(sender: chrome.runtime.MessageSender): boolean {
  if (
    sender.id !== chrome.runtime.id ||
    sender.tab?.id === undefined ||
    sender.frameId !== 0
  )
    return false;
  try {
    return ["http:", "https:"].includes(new URL(sender.url ?? "").protocol);
  } catch {
    return false;
  }
}
export function validateRequest(
  value: unknown,
  sender: chrome.runtime.MessageSender,
): Request {
  const invalid = () => {
    throw new UserError("허용되지 않거나 올바르지 않은 요청이에요.");
  };
  if (!isRecord(value) || typeof value.type !== "string") return invalid();
  const options = isOptionsSender(sender);
  const page = isPageSender(sender);
  if (!options && !page) return invalid();
  switch (value.type) {
    case "GET_SETTINGS":
    case "OPEN_OPTIONS":
      return { type: value.type };
    case "SAVE_SETTINGS": {
      if (!options || !isRecord(value.settings)) return invalid();
      const s = value.settings;
      if (
        typeof s.enabled !== "boolean" ||
        !["left", "right"].includes(String(s.panelSide)) ||
        (s.consentVersion !== 0 && s.consentVersion !== CONSENT_VERSION) ||
        (s.apiKey !== undefined &&
          (typeof s.apiKey !== "string" || s.apiKey.length > 256)) ||
        (s.removeKey !== undefined && typeof s.removeKey !== "boolean")
      )
        return invalid();
      return {
        type: "SAVE_SETTINGS",
        settings: {
          enabled: s.enabled,
          panelSide: s.panelSide as "left" | "right",
          consentVersion: s.consentVersion,
          apiKey: s.apiKey as string | undefined,
          removeKey: s.removeKey as boolean | undefined,
        },
      };
    }
    case "TEST_API_KEY":
      if (
        !options ||
        (value.apiKey !== undefined &&
          (typeof value.apiKey !== "string" || value.apiKey.length > 256))
      )
        return invalid();
      return {
        type: "TEST_API_KEY",
        apiKey: value.apiKey as string | undefined,
      };
    case "ANALYZE": {
      const p = value.page;
      if (
        !page ||
        !isRecord(p) ||
        typeof p.title !== "string" ||
        p.title.length > 300 ||
        typeof p.text !== "string" ||
        p.text.trim().length < MIN_TEXT ||
        p.text.length > MAX_TEXT ||
        typeof p.truncated !== "boolean" ||
        typeof value.requestId !== "string" ||
        !/^[a-zA-Z0-9-]{1,64}$/.test(value.requestId)
      )
        return invalid();
      return {
        type: "ANALYZE",
        requestId: value.requestId,
        page: { title: p.title, text: p.text, truncated: p.truncated },
      };
    }
    case "CANCEL":
      if (
        !page ||
        typeof value.requestId !== "string" ||
        !/^[a-zA-Z0-9-]{1,64}$/.test(value.requestId)
      )
        return invalid();
      return { type: "CANCEL", requestId: value.requestId };
    case "SET_POSITION":
      if (
        !page ||
        typeof value.position !== "number" ||
        !Number.isFinite(value.position) ||
        value.position < 0 ||
        value.position > 1
      )
        return invalid();
      return { type: "SET_POSITION", position: value.position };
    default:
      return invalid();
  }
}
