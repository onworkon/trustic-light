import { CONSENT_VERSION, UserError } from "../shared/types";
import type { Analysis, PageText, Request } from "../shared/types";
import { analyze, testKey } from "./api";
import {
  readKey,
  readSettings,
  savePosition,
  saveSettings,
  validateKey,
} from "./settings";

interface Job {
  id: string;
  controller: AbortController;
  document: string;
}
interface Dependencies {
  analyze: (
    page: PageText,
    key: string,
    signal: AbortSignal,
  ) => Promise<Analysis>;
  readKey: typeof readKey;
  readSettings: typeof readSettings;
}
export class AnalysisController {
  private jobs = new Map<number, Job>();
  private lastRequest = new Map<number, number>();
  constructor(
    private dependencies: Dependencies = { analyze, readKey, readSettings },
  ) {}
  cancel(tabId: number, requestId?: string, document?: string): void {
    const job = this.jobs.get(tabId);
    if (
      job &&
      (!requestId || job.id === requestId) &&
      (!document || job.document === document)
    ) {
      job.controller.abort();
      this.jobs.delete(tabId);
    }
  }
  cancelAll(): void {
    for (const tabId of this.jobs.keys()) this.cancel(tabId);
  }
  forget(tabId: number): void {
    this.cancel(tabId);
    this.lastRequest.delete(tabId);
  }
  async run(
    request: Extract<Request, { type: "ANALYZE" }>,
    sender: chrome.runtime.MessageSender,
  ): Promise<Analysis> {
    const tabId = sender.tab!.id!;
    const document = sender.documentId ?? sender.url ?? "";
    const existing = this.jobs.get(tabId);
    if (existing?.document !== document) this.cancel(tabId);
    if (this.jobs.has(tabId))
      throw new UserError("이미 이 페이지를 분석하고 있어요.");
    if (this.jobs.size >= 2)
      throw new UserError("다른 페이지의 분석이 끝난 뒤 다시 시도해 주세요.");
    if (Date.now() - (this.lastRequest.get(tabId) ?? 0) < 3000)
      throw new UserError("잠시 후 다시 시도해 주세요.");
    // Reserve synchronously, before any await, to prevent concurrent duplicate charges.
    const job: Job = {
      id: request.requestId,
      document,
      controller: new AbortController(),
    };
    this.jobs.set(tabId, job);
    let keepAlive: ReturnType<typeof setInterval> | undefined;
    try {
      const settings = await this.dependencies.readSettings();
      if (!settings.enabled)
        throw new UserError("설정에서 신뢰등을 켜 주세요.");
      if (settings.consentVersion !== CONSENT_VERSION)
        throw new UserError(
          "설정에서 본문 전송 안내를 확인하고 동의해 주세요.",
        );
      const key = await this.dependencies.readKey();
      if (job.controller.signal.aborted)
        throw new UserError("분석을 취소했어요.");
      this.lastRequest.set(tabId, Date.now());
      // A bounded, user-initiated request may outlive the worker's idle timer.
      keepAlive = setInterval(() => {
        void chrome.runtime.getPlatformInfo().catch(() => {});
      }, 20_000);
      const result = await this.dependencies.analyze(
        request.page,
        key,
        job.controller.signal,
      );
      if (job.controller.signal.aborted)
        throw new UserError("분석을 취소했어요.");
      return result;
    } finally {
      if (keepAlive) clearInterval(keepAlive);
      if (this.jobs.get(tabId) === job) this.jobs.delete(tabId);
    }
  }
}
export const controller = new AnalysisController();
let settingsWrite: Promise<unknown> = Promise.resolve();
function serializeWrite<T>(work: () => Promise<T>): Promise<T> {
  const result = settingsWrite.then(work);
  settingsWrite = result.catch(() => {});
  return result;
}
async function broadcastSettings(): Promise<void> {
  const settings = await readSettings();
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((tab) => tab.id !== undefined)
      .map((tab) =>
        chrome.tabs.sendMessage(tab.id!, {
          type: "SETTINGS_CHANGED",
          settings,
        }),
      ),
  );
}
let testingKey = false;
export async function dispatch(
  request: Request,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (request.type) {
    case "GET_SETTINGS":
      return readSettings();
    case "OPEN_OPTIONS":
      await chrome.runtime.openOptionsPage();
      return null;
    case "ANALYZE":
      return controller.run(request, sender);
    case "CANCEL":
      controller.cancel(
        sender.tab!.id!,
        request.requestId,
        sender.documentId ?? sender.url ?? "",
      );
      return null;
    case "SET_POSITION":
      await serializeWrite(() => savePosition(request.position));
      return null;
    case "SAVE_SETTINGS": {
      const settings = await serializeWrite(() =>
        saveSettings(request.settings),
      );
      controller.cancelAll();
      await broadcastSettings();
      return settings;
    }
    case "TEST_API_KEY": {
      if (testingKey)
        throw new UserError("연결을 확인하고 있어요. 잠시 기다려 주세요.");
      testingKey = true;
      try {
        return await testKey(
          request.apiKey ? validateKey(request.apiKey) : await readKey(),
        );
      } finally {
        testingKey = false;
      }
    }
  }
}
