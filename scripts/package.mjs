import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { zipSync, unzipSync } from "fflate";

// Import also rebuilds and verifies the exact files about to be shipped.
await import("./build.mjs");
const root = fileURLToPath(new URL("../", import.meta.url));
const { version } = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
);
const entries = {};
async function walk(path = "") {
  for (const item of (
    await readdir(resolve(root, "dist", path), { withFileTypes: true })
  ).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path ? `${path}/${item.name}` : item.name;
    if (item.isDirectory()) await walk(name);
    else
      entries[name] = [
        new Uint8Array(await readFile(resolve(root, "dist", name))),
        { mtime: new Date("2020-01-01T00:00:00Z") },
      ];
  }
}
await walk();
const bytes = zipSync(entries, { level: 9 });
const unpacked = unzipSync(bytes);
if (
  Object.keys(unpacked).length !== Object.keys(entries).length ||
  !unpacked["manifest.json"]
)
  throw new Error("ZIP verification failed.");
const name = `trustlight-${version}.zip`;
const digest = createHash("sha256").update(bytes).digest("hex");
await mkdir(resolve(root, "release"), { recursive: true });
await writeFile(resolve(root, "release", name), bytes);
await writeFile(
  resolve(root, "release", `${name}.sha256`),
  `${digest}  ${name}\n`,
);
console.log(
  `Created release/${name} (${bytes.length.toLocaleString()} bytes), SHA-256 ${digest}`,
);
