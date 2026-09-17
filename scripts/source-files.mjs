import { lstat, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const ROOT_FILES = [
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  ".node-version",
  ".prettierignore",
  "README.md",
  "manifest.json",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
];
export const SOURCE_DIRS = [".github", "public", "scripts", "src", "tests"];
const blockedParts = new Set([
  ".git",
  ".archive",
  ".local",
  ".codex",
  ".agents",
  "private",
  "node_modules",
  "dist",
  "release",
  "coverage",
]);

export function assertSourcePath(name) {
  const parts = name.split("/");
  if (
    name.includes("\\") ||
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        blockedParts.has(part.toLowerCase()),
    ) ||
    /(?:^|\/)\.env[^/]*$/i.test(name)
  ) {
    throw new Error(`Disallowed source path: ${name}`);
  }
  if (ROOT_FILES.includes(name)) return;
  if (
    !SOURCE_DIRS.includes(parts[0]) ||
    !/\.(?:ts|mjs|css|html|json|md|yml|yaml|png)$/.test(name)
  )
    throw new Error(`Unexpected source file: ${name}`);
  if (
    name.endsWith(".png") &&
    !/^public\/icons\/icon(?:16|48|128)\.png$/.test(name)
  )
    throw new Error(`Unexpected binary file: ${name}`);
}

/** Known credential formats only. Never include the matched value in an error. */
export function containsCredential(bytes) {
  const text = bytes.toString("utf8");
  return (
    /\bsk-ant-[A-Za-z0-9_-]{20,}/.test(text) ||
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/.test(
      text,
    ) ||
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/.test(text) ||
    /\bAKIA[A-Z0-9]{16}\b/.test(text)
  );
}

export async function collectSourceFiles(root) {
  const files = new Map();
  async function visit(name) {
    const path = resolve(root, name);
    const stat = await lstat(path);
    if (stat.isSymbolicLink())
      throw new Error(`Source symlink is not allowed: ${name}`);
    if (stat.isDirectory()) {
      for (const item of (await readdir(path)).sort())
        await visit(`${name}/${item}`);
      return;
    }
    assertSourcePath(name);
    if (!stat.isFile() || stat.size > 5_000_000)
      throw new Error(`Unsupported source file: ${name}`);
    const bytes = await readFile(path);
    if (containsCredential(bytes))
      throw new Error(`Possible credential found in ${name}. Value withheld.`);
    files.set(name, bytes);
  }
  for (const name of [...ROOT_FILES, ...SOURCE_DIRS]) await visit(name);
  return files;
}
