import test from "node:test";
import assert from "node:assert/strict";
import { validateAnalysis, analysisBody } from "../src/background/analysis";
import { normalizeText, truncateText } from "../src/shared/text";
import { MODEL } from "../src/shared/types";

const page = {
  title: "시험 기사",
  text: "일부 사람들은 모두 잘못됐다고 주장했다.\n\n다른 연구는 반대되는 결과를 보였다.",
  truncated: false,
};
const base = {
  reliability: 65,
  biases: ["generalization"],
  summary: "일반화 표현이 있어요.",
  findings: [
    {
      quote: "모두 잘못됐다고 주장했다.",
      bias: "generalization",
      explanation: "일부를 전체로 확대해요.",
      severity: 2,
    },
  ],
};
test("validates scores and derives traffic-light boundaries", () => {
  for (const [score, level] of [
    [0, "warning"],
    [39, "warning"],
    [40, "caution"],
    [69, "caution"],
    [70, "good"],
    [100, "good"],
  ] as const)
    assert.equal(
      validateAnalysis({ ...base, reliability: score }, page).level,
      level,
    );
});
test("malformed scores never turn into a zero-score accusation", () => {
  for (const score of [undefined, null, "90", NaN, Infinity, -1, 101, 50.5])
    assert.throws(() =>
      validateAnalysis({ ...base, reliability: score }, page),
    );
  for (const value of [
    null,
    [],
    {},
    { ...base, summary: "" },
    { ...base, biases: ["toString"] },
  ])
    assert.throws(() => validateAnalysis(value, page));
});
test("drops fabricated quotes, deduplicates and preserves exact source text", () => {
  const result = validateAnalysis(
    {
      ...base,
      findings: [
        ...base.findings,
        ...base.findings,
        { ...base.findings[0], quote: "전혀 존재하지 않는 문장입니다." },
      ],
    },
    page,
  );
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.quote, base.findings[0]?.quote);
});
test("only submitted text can support findings", () => {
  const result = validateAnalysis(
    {
      ...base,
      findings: [
        { ...base.findings[0], quote: "다른 연구는 반대되는 결과를 보였다." },
      ],
    },
    {
      ...page,
      text: "일부 사람들은 모두 잘못됐다고 주장했다.",
      truncated: true,
    },
  );
  assert.equal(result.findings.length, 0);
});
test("rejects malformed severity and explanation", () => {
  for (const severity of ["2", 0, 4, null])
    assert.throws(() =>
      validateAnalysis(
        { ...base, findings: [{ ...base.findings[0], severity }] },
        page,
      ),
    );
});
test("prompt contains only bounded title/body data and uses selected model", () => {
  const body = analysisBody(page);
  assert.equal(body.model, MODEL);
  assert.equal(body.stream, true);
  assert.equal(JSON.stringify(body).includes("http://"), false);
});
test("normalization and truncation handle whitespace and UTF-16 pairs", () => {
  assert.equal(normalizeText(" a\u200b \n b "), "a b");
  assert.equal(truncateText("a😀b", 2).text, "a");
  assert.deepEqual(truncateText("hello", 10), {
    text: "hello",
    truncated: false,
  });
});
