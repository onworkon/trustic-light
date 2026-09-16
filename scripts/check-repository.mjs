import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSourcePath,
  collectSourceFiles,
  containsCredential,
} from "./source-files.mjs";

export async function checkRepository(root) {
  const files = await collectSourceFiles(root);
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      maxBuffer: 16_000_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  let gitRoot;
  try {
    gitRoot = git(["rev-parse", "--show-toplevel"]).toString().trim();
  } catch {
    /* Source ZIPs do not contain .git. */
  }
  if (gitRoot && resolve(gitRoot) === resolve(root)) {
    // Inspect the index as well: .gitignore does not protect files already staged.
    const staged = git(["ls-files", "--stage", "-z"])
      .toString()
      .split("\0")
      .filter(Boolean);
    for (const entry of staged) {
      const match = /^(\d+) ([a-f0-9]+) (\d)\t([\s\S]+)$/.exec(entry);
      if (!match) throw new Error("Could not inspect the Git index.");
      const [, mode, objectId, stage, name] = match;
      assertSourcePath(name);
      if (stage !== "0" || mode !== "100644")
        throw new Error(
          `Unexpected Git file mode or unresolved merge: ${name}`,
        );
      const bytes = git(["cat-file", "blob", objectId]);
      if (containsCredential(bytes))
        throw new Error(
          `Possible credential staged in ${name}. Value withheld.`,
        );
    }
    const candidates = git([
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
    ])
      .toString()
      .split("\0")
      .filter(Boolean);
    for (const name of candidates) assertSourcePath(name);
    for (const name of files.keys())
      if (!candidates.includes(name))
        throw new Error(`Required source file is ignored by Git: ${name}`);
    console.log(
      `Git index and ${new Set(candidates).size} upload candidates verified.`,
    );
  }
  console.log(
    `Verified ${files.size} source files; local credentials and generated folders are excluded.`,
  );
  return files;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await checkRepository(fileURLToPath(new URL("../", import.meta.url)));
}
