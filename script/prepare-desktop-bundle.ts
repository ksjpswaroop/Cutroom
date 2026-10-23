/**
 * Prepare the Node sidecar payload that ships inside the macOS .app Resources.
 * Layout: src-tauri/resources/app/{dist/index.cjs, dist/public, package.json, node_modules}
 */
import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const dest = path.join(root, "src-tauri", "resources", "app");

/**
 * `npm run` copies the user `allow-scripts` setting into
 * `npm_config_allow_scripts`. npm 11 then rejects that env var on a
 * project install (`EALLOWSCRIPTS`). Nested installs must not inherit it.
 */
export function envForNestedNpm(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env };
  for (const key of Object.keys(next)) {
    if (key.toLowerCase() === "npm_config_allow_scripts" || key.toLowerCase().startsWith("npm_config_allow_scripts_")) {
      delete next[key];
    }
  }
  return next;
}

async function main() {
  console.log("Running production build first...");
  const build = spawnSync("npm", ["run", "build"], {
    stdio: "inherit",
    cwd: root,
    shell: true,
    env: envForNestedNpm(),
  });
  if (build.status !== 0) process.exit(build.status ?? 1);

  await rm(dest, { recursive: true, force: true });
  await mkdir(path.join(dest, "dist"), { recursive: true });

  await cp(path.join(root, "dist", "index.cjs"), path.join(dest, "dist", "index.cjs"));
  // Ships beside the bundle because the card renderer runs as a python3
  // subprocess and is therefore not part of the JavaScript bundle.
  await cp(
    path.join(root, "dist", "assemble-cards.py"),
    path.join(dest, "dist", "assemble-cards.py"),
  );
  await cp(path.join(root, "dist", "public"), path.join(dest, "dist", "public"), { recursive: true });

  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const slimPkg = {
    name: "ledger-sidecar",
    version: pkg.version,
    private: true,
    type: "commonjs",
    dependencies: pkg.dependencies,
  };
  // Drop Tauri client deps from the sidecar runtime.
  delete slimPkg.dependencies["@tauri-apps/api"];
  delete slimPkg.dependencies["@tauri-apps/plugin-dialog"];
  delete slimPkg.dependencies["@tauri-apps/plugin-process"];
  await writeFile(path.join(dest, "package.json"), `${JSON.stringify(slimPkg, null, 2)}\n`);

  console.log("Installing production dependencies into sidecar bundle...");
  const install = spawnSync("npm", ["install", "--omit=dev", "--ignore-scripts"], {
    stdio: "inherit",
    cwd: dest,
    shell: true,
    env: envForNestedNpm(),
  });
  if (install.status !== 0) process.exit(install.status ?? 1);

  console.log(`Sidecar ready at ${dest}`);
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
