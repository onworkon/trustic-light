export const BIASES = {
  loaded_language: "표현상의 편향",
  framing: "프레이밍 편향",
  selection: "선택적 정보 편향",
  source: "출처 편향",
  evidence: "인용·통계 편향",
  omission: "누락 편향",
  generalization: "일반화 편향",
  causal: "인과관계 편향",
  attribution: "귀인 편향",
  confirmation: "확증 편향",
} as const;
export type Bias = keyof typeof BIASES;
export type Level = "good" | "caution" | "warning";
export const LEVEL_LABELS: Record<Level, string> = {
  good: "양호",
  caution: "주의",
  warning: "경고",
};
export const MODEL = "claude-opus-5";
export const MAX_TEXT = 9_000;
export const MIN_TEXT = 80;
export const CONSENT_VERSION = 1;
export interface Settings {
  enabled: boolean;
  panelSide: "left" | "right";
  consentVersion: number;
  position: number | null;
}
export interface PublicSettings extends Settings {
  hasApiKey: boolean;
}
export interface PageText {
  title: string;
  text: string;
  truncated: boolean;
}
export interface Finding {
  id: string;
  quote: string;
  bias: Bias;
  explanation: string;
  severity: 1 | 2 | 3;
}
export interface Analysis {
  reliability: number;
  level: Level;
  biases: Bias[];
  summary: string;
  findings: Finding[];
  model: string;
  analyzedChars: number;
  truncated: boolean;
  durationMs: number;
}
export interface SettingsUpdate {
  enabled: boolean;
  panelSide: "left" | "right";
  consentVersion: number;
  apiKey?: string;
  removeKey?: boolean;
}
export type Request =
  | { type: "GET_SETTINGS" }
  | { type: "SAVE_SETTINGS"; settings: SettingsUpdate }
  | { type: "TEST_API_KEY"; apiKey?: string }
  | { type: "ANALYZE"; page: PageText; requestId: string }
  | { type: "CANCEL"; requestId: string }
  | { type: "SET_POSITION"; position: number }
  | { type: "OPEN_OPTIONS" };
export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export class UserError extends Error {}
export function publicError(error: unknown): string {
  return error instanceof UserError
    ? error.message
    : "요청을 처리하지 못했어요. 확장 프로그램과 페이지를 새로고침한 뒤 다시 시도해 주세요.";
}
