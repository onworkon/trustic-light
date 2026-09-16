import { CONSENT_VERSION, isRecord, UserError } from "../shared/types";
import type { PublicSettings, Settings, SettingsUpdate } from "../shared/types";

const SETTINGS_KEY = "trustlight.settings.v2";
const SECRET_KEY = "trustlight.apiKey";
export const DEFAULTS: Readonly<Settings> = Object.freeze({
  enabled: true,
  panelSide: "left",
  consentVersion: 0,
  position: null,
});
export function normalizeSettings(value: unknown): Settings {
  const data = isRecord(value) ? value : {};
  return {
    enabled:
      typeof data.enabled === "boolean" ? data.enabled : DEFAULTS.enabled,
    panelSide: data.panelSide === "right" ? "right" : "left",
    consentVersion:
      data.consentVersion === CONSENT_VERSION ? CONSENT_VERSION : 0,
    position:
      typeof data.position === "number" &&
      Number.isFinite(data.position) &&
      data.position >= 0 &&
      data.position <= 1
        ? data.position
        : null,
  };
}
export function validateKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^sk-ant-[A-Za-z0-9_-]{16,250}$/.test(value.trim())
  ) {
    throw new UserError("올바른 Anthropic API 키를 입력해 주세요.");
  }
  return value.trim();
}
/** Block content-script access before reading or migrating any credential. */
export async function initializeStorage(): Promise<void> {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  const values = await chrome.storage.local.get([
    SETTINGS_KEY,
    SECRET_KEY,
    "trustlight.settings",
    "trustlight.credentialRevision",
    "trustlight.lightPosition",
  ]);
  const legacy = values["trustlight.settings"];
  if (!values[SETTINGS_KEY]) {
    const settings = normalizeSettings(legacy);
    settings.consentVersion = 0;
    settings.position = normalizeSettings({
      position: values["trustlight.lightPosition"],
    }).position;
    const migrated: Record<string, unknown> = { [SETTINGS_KEY]: settings };
    // A revision marks a developer-provided bootstrap key: never migrate it.
    if (
      !values[SECRET_KEY] &&
      !values["trustlight.credentialRevision"] &&
      isRecord(legacy) &&
      typeof legacy.apiKey === "string"
    ) {
      try {
        migrated[SECRET_KEY] = validateKey(legacy.apiKey);
      } catch {
        /* Invalid legacy credentials are discarded. */
      }
    }
    await chrome.storage.local.set(migrated);
  }
  await chrome.storage.local.remove([
    "trustlight.settings",
    "trustlight.credentialRevision",
    "trustlight.lightPosition",
  ]);
}
export async function readSettings(): Promise<PublicSettings> {
  const values = await chrome.storage.local.get([SETTINGS_KEY, SECRET_KEY]);
  return {
    ...normalizeSettings(values[SETTINGS_KEY]),
    hasApiKey:
      typeof values[SECRET_KEY] === "string" && values[SECRET_KEY].length > 0,
  };
}
export async function readKey(): Promise<string> {
  const value = (await chrome.storage.local.get(SECRET_KEY))[SECRET_KEY];
  if (!value) throw new UserError("설정에서 본인의 API 키를 등록해 주세요.");
  return validateKey(value);
}
export async function saveSettings(
  update: SettingsUpdate,
): Promise<PublicSettings> {
  const current = await readSettings();
  const settings = normalizeSettings({
    ...current,
    ...update,
    position: current.position,
  });
  const values: Record<string, unknown> = { [SETTINGS_KEY]: settings };
  if (update.apiKey) values[SECRET_KEY] = validateKey(update.apiKey);
  if (update.removeKey) values[SECRET_KEY] = "";
  await chrome.storage.local.set(values);
  return readSettings();
}
export async function savePosition(position: number): Promise<void> {
  const current = await readSettings();
  await chrome.storage.local.set({
    [SETTINGS_KEY]: normalizeSettings({ ...current, position }),
  });
}
