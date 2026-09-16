import { MAX_TEXT } from "../shared/types";
import type { PageText } from "../shared/types";
import { truncateText } from "../shared/text";

const EXCLUDED =
  'script,style,noscript,template,svg,canvas,iframe,nav,footer,aside,form,input,textarea,select,button,[contenteditable]:not([contenteditable="false"]),[hidden],[inert],[aria-hidden="true"],[data-private],[data-trustlight]';
const BLOCKS =
  "p,div,section,article,main,li,h1,h2,h3,h4,h5,h6,blockquote,td,br";
type Position = { node: Text; offset: number };
export interface ExtractedPage {
  page: PageText;
  findRange: (quote: string) => Range | null;
  root: Element;
}

/** Read only visible, non-editable text, with an index into the original DOM. */
export function extractPage(document: Document): ExtractedPage {
  const view = document.defaultView!;
  const visibility = new WeakMap<Element, boolean>();
  function visible(element: Element): boolean {
    const known = visibility.get(element);
    if (known !== undefined) return known;
    const style = view.getComputedStyle(element);
    const result =
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.visibility !== "collapse" &&
      style.opacity !== "0" &&
      (!element.parentElement || visible(element.parentElement));
    visibility.set(element, result);
    return result;
  }
  const candidates = [
    ...document.querySelectorAll('article,[role="main"],main'),
  ].filter((element) => !element.closest(EXCLUDED) && visible(element));
  const root =
    candidates.sort(
      (a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0),
    )[0] ?? document.body;
  if (!root) throw new Error("분석할 본문을 찾지 못했어요.");
  const walker = document.createTreeWalker(root, view.NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      return parent && !parent.closest(EXCLUDED) && visible(parent)
        ? view.NodeFilter.FILTER_ACCEPT
        : view.NodeFilter.FILTER_REJECT;
    },
  });
  let text = "";
  const positions: Position[] = [];
  let previousBlock: Element | null = null;
  let scanned = 0;
  let truncated = false;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (++scanned > 20_000) {
      truncated = true;
      break;
    }
    const current = node as Text;
    const block = current.parentElement?.closest(BLOCKS) ?? null;
    if (text && block !== previousBlock && !text.endsWith(" ")) {
      text += " ";
      positions.push({ node: current, offset: 0 });
    }
    previousBlock = block;
    for (let offset = 0; offset < current.data.length; offset++) {
      const character = current.data[offset]!;
      if (/[\s\u00a0\u200b]/u.test(character)) {
        if (!text || text.endsWith(" ")) continue;
        text += " ";
      } else text += character;
      positions.push({ node: current, offset });
      if (text.length > MAX_TEXT) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }
  text = truncateText(text, MAX_TEXT).text.trimEnd();
  const page: PageText = {
    title: document.title.slice(0, 300),
    text,
    truncated,
  };
  return {
    page,
    root,
    findRange(quote) {
      const start = text.indexOf(quote);
      if (start < 0 || !quote) return null;
      const from = positions[start];
      const to = positions[start + quote.length - 1];
      if (
        !from?.node.isConnected ||
        !to?.node.isConnected ||
        to.offset >= to.node.length
      )
        return null;
      const range = document.createRange();
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset + 1);
      // DOM may have changed while awaiting the network response.
      if (
        range
          .toString()
          .replace(/[\s\u00a0\u200b]+/gu, " ")
          .trim() !== quote
      )
        return null;
      return range;
    },
  };
}
