import "./load-env";
import express, { type Request, Response, NextFunction } from "express";
import { serveStatic } from "./static";
import { createServer } from "http";
import { getEnvFilePaths } from "./env-path";

const app = express();
const httpServer = createServer(app);

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob: https://i.ytimg.com https://yt3.ggpht.com https://*.googleusercontent.com; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    );
  }
  next();
});

app.use(
  express.json({
    limit: "18mb",
  }),
);

app.use(express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 100 }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const pathName = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (pathName.startsWith("/api")) {
      log(`${req.method} ${pathName} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  const { hydrateSecretsFromKeychain, migrateEnvSecretsToKeychain, resolveSecretsBackend } = await import("./keychain");
  const hydrated = await hydrateSecretsFromKeychain();
  if (hydrated.loaded.length > 0) {
    log(`loaded ${hydrated.loaded.length} secret(s) from OS keychain`);
  }

  // If keychain is active, scrub any leftover plaintext secrets from `.env`.
  if (hydrated.backend === "keychain") {
    const { readFile, writeFile, chmod, mkdir } = await import("node:fs/promises");
    const { envPath, envTempPath, root } = getEnvFilePaths();
    try {
      await mkdir(root, { recursive: true });
      const raw = await readFile(envPath, "utf8");
      const { contents, migrated } = await migrateEnvSecretsToKeychain(raw);
      if (migrated.length > 0 || contents !== raw) {
        await writeFile(envTempPath, contents, { encoding: "utf8", mode: 0o600 });
        const { rename } = await import("node:fs/promises");
        await rename(envTempPath, envPath);
        await chmod(envPath, 0o600);
        if (migrated.length > 0) {
          log(`migrated ${migrated.length} secret(s) from .env into OS keychain`);
        }
      }
    } catch (error: any) {
      if (error?.code !== "ENOENT") {
        log(`keychain migration skipped: ${error?.message || error}`, "express");
      }
    }
  } else {
    await resolveSecretsBackend();
  }

  const { registerRoutes } = await import("./routes");
  await registerRoutes(httpServer, app);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API endpoint not found" });
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    log(`unhandled request error (${status})`, "express");
    if (!res.headersSent) {
      res.status(status).json({ message: "Internal Server Error" });
    }
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.HOST || "127.0.0.1";
  const { root } = getEnvFilePaths();
  const secretsBackend = await (await import("./keychain")).resolveSecretsBackend();
  httpServer.listen(
    {
      port,
      host,
    },
    () => {
      log(`serving on ${host}:${port} (secrets root: ${root}; secrets: ${secretsBackend})`);
    },
  );
})();
