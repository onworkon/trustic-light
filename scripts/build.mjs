import { build } from "esbuild";
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  readdir,
} from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "dist");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const manifest = JSON.parse(
  await readFile(resolve(root, "manifest.json"), "utf8"),
);
if (manifest.version !== pkg.version)
  throw new Error("Manifest/package versions differ.");
await mkdir(resolve(output, "icons"), { recursive: true });
const common = {
  bundle: true,
  target: "chrome120",
  minify: false,
  sourcemap: false,
  legalComments: "none",
  charset: "utf8",
  logLevel: "warning",
  absWorkingDir: root,
};
await build({
  ...common,
  entryPoints: ["src/background/index.ts"],
  outfile: resolve(output, "background.js"),
  format: "esm",
});
await build({
  ...common,
  entryPoints: ["src/content/index.ts"],
  outfile: resolve(output, "content.js"),
  format: "iife",
  loader: { ".css": "text" },
});
await build({
  ...common,
  entryPoints: ["src/options/index.ts"],
  outfile: resolve(output, "options.js"),
  format: "esm",
});
await copyFile(
  resolve(root, "src/options/index.html"),
  resolve(output, "options.html"),
);
await copyFile(
  resolve(root, "src/options/options.css"),
  resolve(output, "options.css"),
);
await copyFile(
  resolve(root, "src/options/privacy.html"),
  resolve(output, "privacy.html"),
);
for (const size of [16, 48, 128])
  await copyFile(
    resolve(root, `public/icons/icon${size}.png`),
    resolve(output, `icons/icon${size}.png`),
  );
await writeFile(
  resolve(output, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
await verifyDistribution(output);
console.log(
  "Built and verified dist/ (no runtime dependencies or private files).",
);

export async function verifyDistribution(directory) {
  const allowed = new Set([
    "manifest.json",
    "background.js",
    "content.js",
    "options.js",
    "options.html",
    "options.css",
    "privacy.html",
    "icons/icon16.png",
    "icons/icon48.png",
    "icons/icon128.png",
  ]);
  const seen = new Set();
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isSymbolicLink())
        throw new Error("Symlinks are not allowed in dist.");
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      const name = relative(directory, path).replaceAll("\\", "/");
      if (!allowed.has(name))
        throw new Error(
          `Unexpected distribution file: ${name}. Remove it before packaging.`,
        );
      seen.add(name);
      if (!name.endsWith(".png")) {
        const content = await readFile(path, "utf8");
        if (/sk-ant-[A-Za-z0-9_-]{20,}/.test(content))
          throw new Error(`Credential found in ${name}.`);
        if (
          /\beval\s*\(|new\s+Function\s*\(|importScripts\s*\(|private\/bootstrap/.test(
            content,
          )
        )
          throw new Error(`Unsafe code found in ${name}.`);
      }
    }
  }
  await walk(directory);
  if (seen.size !== allowed.size)
    throw new Error("Distribution files are missing.");
  const data = JSON.parse(
    await readFile(resolve(directory, "manifest.json"), "utf8"),
  );
  const referenced = [
    data.background.service_worker,
    data.options_page,
    ...data.content_scripts.flatMap((script) => script.js),
    ...Object.values(data.icons),
    ...Object.values(data.action.default_icon),
  ];
  for (const name of referenced)
    if (!seen.has(name))
      throw new Error(`Manifest references missing file: ${name}`);
  if (
    data.manifest_version !== 3 ||
    data.web_accessible_resources ||
    data.permissions.join(",") !== "storage" ||
    data.host_permissions.join(",") !== "https://api.anthropic.com/*"
  )
    throw new Error("Unexpected manifest permissions.");
}
