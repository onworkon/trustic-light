import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import {
  assertSourcePath,
  containsCredential,
  collectSourceFiles,
  ROOT_FILES,
  SOURCE_DIRS,
} from "../scripts/source-files.mjs";
import { checkRepository } from "../scripts/check-repository.mjs";

test("source export rejects private, generated, traversal and arbitrary binary paths", () => {
  for (const name of [
    "private/bootstrap.json",
    "dist/content.js",
    "src/.env",
    "src/../private/key.json",
    "src/secret.pem",
    "src/test.png",
    "docs/.git/config",
    "C:\\private\\file.ts",
  ])
    assert.throws(() => assertSourcePath(name));
  for (const name of [
    "README.md",
    "src/background/index.ts",
    ".github/workflows/ci.yml",
    "public/icons/icon16.png",
  ])
    assert.doesNotThrow(() => assertSourcePath(name));
});

test("credential checks detect secret formats without depending on filenames", () => {
  for (const value of [
    "sk-ant-" + "a".repeat(40),
    "ghp_" + "b".repeat(40),
    "-----BEGIN " + "PRIVATE KEY-----",
  ])
    assert.equal(containsCredential(Buffer.from(value)), true);
  assert.equal(
    containsCredential(Buffer.from("API key placeholder: sk-ant-…")),
    false,
  );
});

test("upload checks reject force-added private files and a secret left in the Git index", async () => {
  const base = resolve(tmpdir());
  const root = await mkdtemp(resolve(base, "trustlight-repository-test-"));
  const git = (args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    for (const name of ROOT_FILES)
      await writeFile(resolve(root, name), "fixture\n");
    for (const name of SOURCE_DIRS) await mkdir(resolve(root, name));
    await writeFile(resolve(root, ".gitignore"), "private/\n");
    await writeFile(
      resolve(root, "src/example.ts"),
      "export const safe = true;\n",
    );
    await mkdir(resolve(root, "private"));
    await writeFile(resolve(root, "private/bootstrap.json"), "private fixture");
    assert.equal(
      (await collectSourceFiles(root)).has("private/bootstrap.json"),
      false,
    );
    git(["init", "-b", "main"]);
    git(["add", "."]);
    await checkRepository(root);
    git(["add", "-f", "private/bootstrap.json"]);
    await assert.rejects(checkRepository(root), /Disallowed source path/);
    git(["rm", "--cached", "private/bootstrap.json"]);
    const original = await readFile(resolve(root, "src/example.ts"));
    await writeFile(
      resolve(root, "src/example.ts"),
      "sk-ant-" + "a".repeat(40),
    );
    git(["add", "src/example.ts"]);
    await writeFile(resolve(root, "src/example.ts"), original);
    await assert.rejects(checkRepository(root), /credential staged/);
  } finally {
    const target = resolve(root);
    if (
      !target.startsWith(base + sep) ||
      !target.split(sep).at(-1).startsWith("trustlight-repository-test-")
    )
      throw new Error("Unsafe test cleanup path");
    await rm(target, { recursive: true, force: true });
  }
});
