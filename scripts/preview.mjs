/** Local UI harness. It never calls Anthropic and is never copied into dist/. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const mock = `
const state = { enabled: true, panelSide: 'left', consentVersion: location.pathname === '/article' ? 1 : 0, position: null, hasApiKey: location.pathname === '/article' };
const listeners = new Set();
const jobs = new Map();
window.chrome = { runtime: {
  id: 'preview-only', getManifest: () => ({version: '0.3.0 · UI 미리보기'}),
  onMessage: {addListener: callback => listeners.add(callback), removeListener: callback => listeners.delete(callback)},
  sendMessage: async request => {
    switch(request.type) {
      case 'GET_SETTINGS': return {ok:true,data:{...state}};
      case 'SAVE_SETTINGS': Object.assign(state, {enabled:request.settings.enabled,panelSide:request.settings.panelSide,consentVersion:request.settings.consentVersion}); if(request.settings.apiKey) state.hasApiKey=true; if(request.settings.removeKey) state.hasApiKey=false; return {ok:true,data:{...state}};
      case 'TEST_API_KEY': return {ok:true,data:{model:'UI 미리보기 (실제 API 연결 아님)',latencyMs:1}};
      case 'SET_POSITION': state.position=request.position; return {ok:true,data:null};
      case 'OPEN_OPTIONS': window.open('/options.html'); return {ok:true,data:null};
      case 'CANCEL': jobs.set(request.requestId,true); return {ok:true,data:null};
      case 'ANALYZE': await new Promise(resolve=>setTimeout(resolve,800)); if(jobs.has(request.requestId)) return {ok:false,error:'분석을 취소했어요.'}; return {ok:true,data:{reliability:62,level:'caution',biases:['generalization'],summary:'일부 사례를 전체로 확대하는 표현이 있어요.',findings:[{id:'f1',quote:'단 한 번의 사례만으로 모든 결과가 같다고 결론 내렸다.',bias:'generalization',explanation:'한 사례로 전체를 판단하기에는 근거가 부족해요.',severity:2}],model:'preview-only',analyzedChars:request.page.text.length,truncated:false,durationMs:800}};
    }
  }
}};`;
const article = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>신뢰등 기능 확인용 기사</title><style>body{font:18px/2 sans-serif;max-width:760px;margin:80px auto;padding:0 24px;color:#283843;background:#fafbf9}h1{font-size:32px;line-height:1.4}aside{font-size:13px;color:#748576}article{margin-top:32px}button{padding:8px 12px}</style><script src="/preview-mock.js"></script><script defer src="/content.js"></script></head><body><aside>로컬 화면 테스트 · 실제 API 요청 없음</aside><article><h1>하나의 사례로 전체를 판단할 수 있을까?</h1><p>새로운 연구 결과를 읽을 때에는 조사 대상과 방법을 함께 살펴보는 것이 중요하다. 연구진은 여러 지역에서 관측한 자료를 비교하며, 결과가 달라지는 원인을 계속 조사하고 있다고 밝혔다.</p><p>단 한 번의 사례만으로 <strong>모든 결과가 같다고</strong> 결론 내렸다. 그러나 다른 조건에서 진행한 실험에서는 서로 다른 결과가 나타났으며, 전문가들은 더 많은 자료가 필요하다고 설명했다.</p><p>이 글은 신뢰등의 문장 강조와 결과 패널을 확인하기 위한 예시이다. 분석 점수는 실제 모델의 판단이 아니라 로컬 테스트를 위한 고정 값이다.</p></article><form><label>전송에서 제외할 입력란 <input value="입력 중인 비공개 내용"></label></form></body></html>`;
const allowed = new Set([
  "options.html",
  "options.js",
  "options.css",
  "privacy.html",
  "content.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
]);
const mime = {
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  html: "text/html; charset=utf-8",
  png: "image/png",
};
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname.slice(1);
  response.setHeader("Cache-Control", "no-store");
  if (path === "preview-mock.js") {
    response.setHeader("Content-Type", mime.js);
    response.end(mock);
    return;
  }
  if (path === "article") {
    response.setHeader("Content-Type", mime.html);
    response.end(article);
    return;
  }
  if (!allowed.has(path)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  try {
    let content = await readFile(root + path);
    if (path === "options.html")
      content = Buffer.from(
        content
          .toString()
          .replace("<head>", '<head><script src="/preview-mock.js"></script>'),
      );
    response.setHeader(
      "Content-Type",
      mime[path.split(".").pop()] ?? "application/octet-stream",
    );
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
server.listen(4173, "127.0.0.1", () =>
  console.log(
    "UI-only preview: http://127.0.0.1:4173/options.html and /article",
  ),
);
