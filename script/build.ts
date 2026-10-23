import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { cp, rm, readFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "date-fns",
  "express",
  "zod",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // The card renderer is invoked as a separate python3 process, so it is not
  // part of the bundle and has to be copied alongside it. Without this the
  // assemble-preview feature fails in packaged builds while working in dev,
  // where the script still sits next to its TypeScript caller.
  console.log("copying runtime assets...");
  await cp("server/assemble-cards.py", "dist/assemble-cards.py");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
