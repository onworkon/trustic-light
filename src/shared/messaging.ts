import { isRecord } from "./types";
import type { Request } from "./types";
export async function send<T>(request: Request, timeout = 100_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reply: unknown = await Promise.race([
      chrome.runtime.sendMessage(request),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "응답이 없어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.",
              ),
            ),
          timeout,
        );
      }),
    ]);
    if (!isRecord(reply) || typeof reply.ok !== "boolean")
      throw new Error("확장 프로그램 응답을 받지 못했어요.");
    if (!reply.ok)
      throw new Error(
        typeof reply.error === "string"
          ? reply.error
          : "요청을 처리하지 못했어요.",
      );
    return reply.data as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      /context invalidated|receiving end|message (?:port|channel)|could not establish/i.test(
        message,
      )
    )
      throw new Error(
        "확장 프로그램이 업데이트됐어요. 이 페이지를 새로고침해 주세요.",
      );
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
