import type { Analysis } from "../shared/types";
import type { ExtractedPage } from "./extract";

export class Highlights {
  private names = {
    all: `trustlight-${crypto.randomUUID()}`,
    active: `trustlight-${crypto.randomUUID()}`,
  };
  private style: HTMLStyleElement | null = null;
  private ranges = new Map<string, Range>();
  show(result: Analysis, page: ExtractedPage): void {
    this.clear();
    if (!CSS.highlights || typeof Highlight === "undefined") return;
    for (const finding of result.findings) {
      const range = page.findRange(finding.quote);
      if (range) this.ranges.set(finding.id, range);
    }
    this.style = document.createElement("style");
    this.style.dataset.trustlight = "";
    this.style.textContent = `::highlight(${this.names.all}) { background: #ffe29b; color: #28251b; } ::highlight(${this.names.active}) { background: #f5ad67; color: #221b14; text-decoration: underline; }`;
    (document.head ?? document.documentElement).append(this.style);
    CSS.highlights.set(this.names.all, new Highlight(...this.ranges.values()));
  }
  select(id: string): boolean {
    const range = this.ranges.get(id);
    if (!range?.startContainer.isConnected) return false;
    CSS.highlights.set(this.names.active, new Highlight(range));
    const rect = range.getBoundingClientRect();
    window.scrollBy({
      top: rect.top - window.innerHeight / 3,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    return true;
  }
  clear(): void {
    CSS.highlights?.delete(this.names.all);
    CSS.highlights?.delete(this.names.active);
    this.style?.remove();
    this.style = null;
    this.ranges.clear();
  }
}
