import { BIASES, CONSENT_VERSION, LEVEL_LABELS } from "../shared/types";
import type { Analysis, PublicSettings } from "../shared/types";
import styles from "./panel.css";

type Actions = {
  analyze: () => void;
  cancel: () => void;
  options: () => void;
  select: (id: string) => void;
  position: (ratio: number) => void;
};
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
export class Panel {
  readonly host = element("div");
  private anchor = element("div", "anchor");
  private light = element("button", "light");
  private panel = element("section", "panel");
  private content = element("div", "body");
  private status = element("p", "status");
  private abort = new AbortController();
  private settings: PublicSettings | null = null;
  private x = 0;
  constructor(private actions: Actions) {
    this.host.dataset.trustlight = "";
    this.host.id = "trustlight-host";
    this.host.style.cssText =
      "all:initial!important;position:fixed!important;inset:0!important;width:0!important;height:0!important;z-index:2147483647!important;pointer-events:none!important;";
    const shadow = this.host.attachShadow({ mode: "closed" });
    const style = element("style");
    style.textContent = styles;
    this.light.type = "button";
    this.light.setAttribute("aria-label", "신뢰등 분석 열기");
    this.light.setAttribute("aria-expanded", "false");
    this.light.setAttribute("aria-controls", "trustlight-panel");
    for (const name of ["warning", "caution", "good"]) {
      const lamp = element("span", `lamp ${name}`);
      lamp.setAttribute("aria-hidden", "true");
      this.light.append(lamp);
    }
    this.light.addEventListener("click", () =>
      this.open(this.panel.hidden === true),
    );
    this.light.addEventListener("dblclick", () => this.open(true));
    const handle = element("button", "handle", "⠿");
    handle.type = "button";
    handle.title = "드래그하거나 방향키로 위치 이동";
    handle.setAttribute("aria-label", "신뢰등 위치 이동: 왼쪽·오른쪽 방향키");
    this.bindDragging(handle);
    const heading = element("div", "heading");
    const title = element("div", "brand", "신뢰등");
    title.append(element("small", "", "읽는 순간, 한 번 더 생각하기"));
    const close = element("button", "close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "분석 패널 닫기");
    close.addEventListener("click", () => this.open(false));
    heading.append(title, close);
    this.panel.id = "trustlight-panel";
    this.panel.setAttribute("role", "region");
    this.panel.setAttribute("aria-label", "신뢰등 분석");
    this.panel.tabIndex = -1;
    this.panel.hidden = true;
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.panel.append(heading, this.content);
    this.anchor.append(this.light, handle);
    shadow.append(style, this.anchor, this.panel);
    (document.body ?? document.documentElement).append(this.host);
    shadow.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Escape") {
        event.stopPropagation();
        this.open(false);
      }
    });
    window.addEventListener("resize", () => this.layout(), {
      signal: this.abort.signal,
    });
  }
  configure(settings: PublicSettings): void {
    this.settings = settings;
    this.host.style.setProperty(
      "display",
      settings.enabled ? "block" : "none",
      "important",
    );
    this.layout();
  }
  private button(
    text: string,
    action: () => void,
    primary = false,
  ): HTMLButtonElement {
    const button = element("button", primary ? "primary" : "secondary", text);
    button.type = "button";
    button.addEventListener("click", action);
    return button;
  }
  idle(): void {
    this.light.dataset.level = "";
    this.light.dataset.busy = "false";
    this.light.setAttribute("aria-label", "신뢰등 분석 열기");
    this.content.replaceChildren(this.status);
    const ready =
      this.settings?.hasApiKey &&
      this.settings.consentVersion === CONSENT_VERSION;
    this.status.className = "status";
    this.status.textContent = ready
      ? "이 글의 표현과 근거를 살펴볼까요?"
      : "분석을 시작하려면 설정에서 API 키와 본문 전송 동의를 확인해 주세요.";
    this.content.append(
      element(
        "p",
        "muted",
        "분석 버튼을 누르면 이 페이지의 제목과 본문 최대 9,000자가 Anthropic으로 전송돼요. API 이용 요금이 발생할 수 있어요.",
      ),
    );
    const actions = element("div", "actions");
    if (ready)
      actions.append(this.button("이 글 분석하기", this.actions.analyze, true));
    actions.append(this.button("설정 열기", this.actions.options, !ready));
    this.content.append(actions);
  }
  busy(): void {
    this.light.dataset.busy = "true";
    this.light.dataset.level = "";
    this.light.setAttribute("aria-label", "신뢰등 분석 중");
    this.status.className = "status";
    this.status.textContent = "글의 표현과 근거를 살펴보고 있어요…";
    this.content.replaceChildren(
      this.status,
      element(
        "p",
        "muted",
        "최대 90초가 걸릴 수 있어요. 취소하면 진행 중인 요청을 중단해요.",
      ),
    );
    this.content.append(this.button("분석 취소", this.actions.cancel));
  }
  error(message: string): void {
    this.light.dataset.busy = "false";
    this.light.dataset.level = "";
    this.status.className = "status error";
    this.status.textContent = message;
    this.content.replaceChildren(this.status);
    const actions = element("div", "actions");
    actions.append(
      this.button("다시 시도", this.actions.analyze, true),
      this.button("설정", this.actions.options),
    );
    this.content.append(actions);
  }
  result(result: Analysis): void {
    this.light.dataset.busy = "false";
    this.light.dataset.level = result.level;
    this.light.setAttribute(
      "aria-label",
      `신뢰등 ${LEVEL_LABELS[result.level]}, ${result.reliability}점. 결과 열기`,
    );
    this.status.className = "status";
    this.status.textContent = result.summary;
    const score = element("div", "score");
    score.dataset.level = result.level;
    score.append(
      element("strong", "", String(result.reliability)),
      element("span", "", `/ 100 · ${LEVEL_LABELS[result.level]}`),
    );
    this.content.replaceChildren(
      element("p", "muted", "표현·근거 품질 참고 점수"),
      score,
      this.status,
    );
    const tags = element("div");
    for (const bias of result.biases)
      tags.append(element("span", "tag", BIASES[bias]));
    this.content.append(tags);
    const findings = element("div", "findings");
    for (const finding of result.findings) {
      const item = element("button", "finding");
      item.type = "button";
      item.setAttribute("aria-pressed", "false");
      item.append(
        element(
          "small",
          "",
          `${BIASES[finding.bias]} · ${["", "가벼움", "보통", "심각"][finding.severity]}`,
        ),
        element("blockquote", "", `“${finding.quote}”`),
        element("p", "", finding.explanation),
      );
      item.addEventListener("click", () => {
        for (const child of findings.children)
          child.setAttribute("aria-pressed", "false");
        item.setAttribute("aria-pressed", "true");
        this.actions.select(finding.id);
      });
      findings.append(item);
    }
    if (!result.findings.length)
      findings.append(
        element("p", "muted", "인용할 만한 편향 문장이 발견되지 않았어요."),
      );
    this.content.append(
      findings,
      element(
        "p",
        "muted",
        `${result.analyzedChars.toLocaleString("ko-KR")}자 분석${result.truncated ? " · 긴 글의 앞부분만 분석했어요" : ""}`,
      ),
      element(
        "p",
        "disclaimer",
        "AI가 글 안의 표현과 근거를 평가한 참고 정보예요. 외부 사실 확인을 수행하지 않으며, 사실 여부나 작성자의 의도를 확정하지 않아요.",
      ),
    );
    const actions = element("div", "actions");
    actions.append(
      this.button("다시 분석", this.actions.analyze),
      this.button("설정", this.actions.options),
    );
    this.content.append(actions);
  }
  notice(message: string): void {
    this.status.textContent = message;
  }
  open(open: boolean): void {
    this.panel.hidden = !open;
    this.light.setAttribute("aria-expanded", String(open));
    this.layout();
    if (open) this.panel.focus({ preventScroll: true });
    else this.light.focus({ preventScroll: true });
  }
  private layout(): void {
    const width = window.innerWidth;
    const max = Math.max(12, width - 72);
    this.x =
      this.settings?.position == null
        ? Math.max(12, width - 90)
        : 12 + this.settings.position * (max - 12);
    this.anchor.style.left = `${this.x}px`;
    const panelWidth = Math.min(350, width - 24);
    const left =
      this.settings?.panelSide === "right"
        ? this.x + 70
        : this.x - panelWidth - 10;
    const fits = left >= 12 && left + panelWidth <= width - 12;
    this.panel.style.left = `${Math.max(12, Math.min(left, width - panelWidth - 12))}px`;
    const top = fits ? 40 : 205;
    this.panel.style.top = `${Math.min(top, Math.max(12, window.innerHeight - 220))}px`;
    this.panel.style.maxHeight = `calc(100dvh - ${Math.min(top, Math.max(12, window.innerHeight - 220)) + 12}px)`;
  }
  private bindDragging(handle: HTMLButtonElement): void {
    let drag: { id: number; start: number; x: number } | null = null;
    const move = (x: number) => {
      if (!this.settings) return;
      const range = Math.max(1, window.innerWidth - 84);
      this.settings.position = Math.max(0, Math.min(1, (x - 12) / range));
      this.layout();
    };
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      drag = { id: event.pointerId, start: event.clientX, x: this.x };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (drag?.id === event.pointerId)
        move(drag.x + event.clientX - drag.start);
    });
    const finish = () => {
      if (drag) {
        drag = null;
        if (this.settings?.position != null)
          this.actions.position(this.settings.position);
      }
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("lostpointercapture", finish);
    handle.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      move(
        event.key === "Home"
          ? 12
          : event.key === "End"
            ? window.innerWidth - 72
            : this.x + (event.key === "ArrowLeft" ? -20 : 20),
      );
      if (this.settings?.position != null)
        this.actions.position(this.settings.position);
    });
  }
  destroy(): void {
    this.abort.abort();
    this.host.remove();
  }
}
