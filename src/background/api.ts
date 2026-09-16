import { MODEL, UserError, isRecord } from "../shared/types";
import type { Analysis, PageText } from "../shared/types";
import { analysisBody, validateAnalysis } from "./analysis";

const API = "https://api.anthropic.com/v1";
const MAX_RESPONSE_BYTES = 256_000;
function headers(apiKey: string): HeadersInit {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}
function httpError(status: number): UserError {
  const messages: Record<number, string> = {
    400: "API 요청을 처리할 수 없어요. 모델 접근 권한과 계정 잔액을 확인해 주세요.",
    401: "API 키가 유효하지 않아요. 설정에서 다시 등록해 주세요.",
    403: "이 API 키로는 해당 모델을 사용할 수 없어요.",
    404: "분석 모델을 찾을 수 없어요. 확장 프로그램 업데이트를 확인해 주세요.",
    429: "API 사용 한도에 도달했어요. 잠시 후 다시 시도해 주세요.",
    529: "Claude 서버가 혼잡해요. 잠시 후 다시 시도해 주세요.",
  };
  return new UserError(
    messages[status] ??
      `Claude 서버 오류가 발생했어요 (${status}). 잠시 후 다시 시도해 주세요.`,
  );
}
export async function readBounded(response: Response): Promise<string> {
  if (!response.body) throw new UserError("서버에서 빈 응답을 보냈어요.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES)
        throw new UserError("서버 응답이 허용 크기를 초과했어요.");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
/** SSE is bounded and parsed only as data; code from API responses is never executed. */
export function parseStream(body: string): { text: string; model: string } {
  let text = "";
  let model = "";
  let stopReason = "";
  let completed = false;
  for (const event of body.replace(/\r\n/g, "\n").split("\n\n")) {
    const data = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    let value: unknown;
    try {
      value = JSON.parse(data);
    } catch {
      throw new UserError("서버의 스트리밍 응답을 해석할 수 없어요.");
    }
    if (!isRecord(value)) continue;
    if (value.type === "error")
      throw new UserError(
        "Claude가 분석을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    if (
      value.type === "message_start" &&
      isRecord(value.message) &&
      typeof value.message.model === "string"
    )
      model = value.message.model;
    if (
      value.type === "content_block_start" &&
      isRecord(value.content_block) &&
      value.content_block.type === "text" &&
      typeof value.content_block.text === "string"
    )
      text += value.content_block.text;
    if (
      value.type === "content_block_delta" &&
      isRecord(value.delta) &&
      value.delta.type === "text_delta" &&
      typeof value.delta.text === "string"
    )
      text += value.delta.text;
    if (
      value.type === "message_delta" &&
      isRecord(value.delta) &&
      typeof value.delta.stop_reason === "string"
    )
      stopReason = value.delta.stop_reason;
    if (value.type === "message_stop") completed = true;
  }
  if (!completed || stopReason !== "end_turn" || !text.trim() || !model)
    throw new UserError(
      stopReason === "max_tokens"
        ? "분석 응답이 길어 중단됐어요. 다시 시도해 주세요."
        : "분석이 완료되지 않았어요. 다시 시도해 주세요.",
    );
  return { text, model };
}
async function request(
  path: string,
  apiKey: string,
  init: RequestInit,
  timeout: number,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const signal = AbortSignal.any([
    AbortSignal.timeout(timeout),
    ...(externalSignal ? [externalSignal] : []),
  ]);
  try {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: headers(apiKey),
      signal,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw httpError(response.status);
    }
    return response;
  } catch (error) {
    if (error instanceof UserError) throw error;
    if (externalSignal?.aborted) throw new UserError("분석을 취소했어요.");
    if (signal.aborted)
      throw new UserError(
        "응답 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.",
      );
    throw new UserError(
      "Claude 서버에 연결할 수 없어요. 네트워크 상태를 확인해 주세요.",
    );
  }
}
export async function analyze(
  page: PageText,
  apiKey: string,
  signal: AbortSignal,
): Promise<Analysis> {
  const start = performance.now();
  try {
    const response = await request(
      "/messages",
      apiKey,
      { method: "POST", body: JSON.stringify(analysisBody(page)) },
      90_000,
      signal,
    );
    const stream = parseStream(await readBounded(response));
    if (stream.model !== MODEL)
      throw new UserError(
        "요청한 모델과 다른 응답을 받았어요. 확장 프로그램 업데이트를 확인해 주세요.",
      );
    let raw: unknown;
    try {
      raw = JSON.parse(stream.text);
    } catch {
      throw new UserError("분석 응답을 해석할 수 없어요.");
    }
    return {
      ...validateAnalysis(raw, page),
      model: stream.model,
      analyzedChars: page.text.length,
      truncated: page.truncated,
      durationMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError(
      signal.aborted
        ? "분석을 취소했어요."
        : "응답이 끊기거나 시간이 초과됐어요. 다시 시도해 주세요.",
    );
  }
}
export async function testKey(
  apiKey: string,
): Promise<{ model: string; latencyMs: number }> {
  const start = performance.now();
  try {
    const response = await request(
      `/models/${MODEL}`,
      apiKey,
      { method: "GET" },
      20_000,
    );
    const body: unknown = JSON.parse(await readBounded(response));
    if (!isRecord(body) || body.id !== MODEL)
      throw new UserError("분석 모델 접근을 확인하지 못했어요.");
    return { model: MODEL, latencyMs: Math.round(performance.now() - start) };
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError(
      "연결 확인 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
  }
}
