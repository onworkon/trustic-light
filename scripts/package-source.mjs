import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { zipSync, unzipSync } from "fflate";
import { checkRepository } from "./check-repository.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = await checkRepository(root);
const { version } = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
);
const entries = Object.fromEntries(
  [...files]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, bytes]) => [
      name,
      [new Uint8Array(bytes), { mtime: new Date("2020-01-01T00:00:00Z") }],
    ]),
);
const zip = zipSync(entries, { level: 9 });
const unpacked = unzipSync(zip);
if (Object.keys(unpacked).length !== files.size)
  throw new Error("Source ZIP is missing files.");
for (const [name, bytes] of files)
  if (!bytes.equals(Buffer.from(unpacked[name] ?? [])))
    throw new Error(`Source ZIP verification failed: ${name}`);
const name = `trustlight-source-${version}.zip`;
await mkdir(resolve(root, "release"), { recursive: true });
await writeFile(resolve(root, "release", name), zip);
await writeFile(
  resolve(root, "release", `${name}.sha256`),
  `${createHash("sha256").update(zip).digest("hex")}  ${name}\n`,
);
console.log(
  `Created release/${name}: ${files.size} source files, ${zip.length.toLocaleString()} bytes.`,
);
