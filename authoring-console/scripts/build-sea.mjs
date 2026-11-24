/* global process, console */
// Builds a single-file executable of the launcher with Node SEA (Node 24+).
//   CONSOLE_VERSION=2.0.0-Alpha4 npm run build   (browser bundle + launcher, version stamped)
//   CONSOLE_VERSION=2.0.0-Alpha4 npm run build:sea
// The executable targets the platform it is built on: SEA copies the running `node` binary,
// so build on each target OS/architecture. Output: dist-sea/authoring-console-<os>-<arch>.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { join, relative, sep, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const work = join(root, "dist-sea");
const version = process.env.CONSOLE_VERSION || "0.0.0-dev";
const target = `${process.platform === "darwin" ? "darwin" : process.platform}-${process.arch}`;
const output = join(work, `authoring-console-${target}`);

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`Node 24+ is required, running ${process.version}`);
if (!existsSync(join(dist, "index.html"))) throw new Error("Run `npm run build` before `npm run build:sea`");

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

// 1. One CommonJS file: SEA main scripts cannot be ES modules on Node 24. `vite` is only used by `--dev`.
const bundle = join(work, "launcher.cjs");
await build({
  entryPoints: [join(root, "launcher/index.ts")],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["vite"],
  logLevel: "warning",
  banner: { js: 'var __importMetaUrl = require("node:url").pathToFileURL(process.execPath).href;' },
  define: {
    "import.meta.url": "__importMetaUrl",
    __CONSOLE_VERSION__: JSON.stringify(version),
  },
});

// 2. Embed the browser bundle. Asset keys are paths relative to dist/ (what the launcher serves).
const assets = {};
const collect = (directory) => {
  for (const name of readdirSync(directory)) {
    const file = join(directory, name);
    if (statSync(file).isDirectory()) {
      if (file !== join(dist, "launcher")) collect(file);
    } else if (!name.endsWith(".tsbuildinfo")) {
      assets[relative(dist, file).split(sep).join("/")] = file;
    }
  }
};
collect(dist);
const config = join(work, "sea-config.json");
const blob = join(work, "sea-prep.blob");
writeFileSync(config, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, assets }));
execFileSync(process.execPath, ["--experimental-sea-config", config], { stdio: "inherit" });

// 3. Inject the blob into a copy of this Node binary.
copyFileSync(process.execPath, output);
chmodSync(output, 0o755);
if (process.platform === "darwin") execFileSync("codesign", ["--remove-signature", output], { stdio: "inherit" });
const postject = join(root, "node_modules/.bin/postject");
const args = [output, "NODE_SEA_BLOB", blob, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"];
if (process.platform === "darwin") args.push("--macho-segment-name", "NODE_SEA");
execFileSync(postject, args, { stdio: "inherit" });

// 4. Apple Silicon refuses to run unsigned binaries, so apply an ad-hoc signature.
if (process.platform === "darwin") execFileSync("codesign", ["--sign", "-", output], { stdio: "inherit" });

console.log(`Built ${relative(root, output)} (${version}, ${Object.keys(assets).length} embedded files)`);
