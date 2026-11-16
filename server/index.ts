import "./load-env";
import express, { type Request, Response, NextFunction } from "express";
import { serveStatic } from "./static";
import { createServer } from "http";
import { getEnvFilePaths } from "./env-path";
import { recordDiagnostic } from "./diagnostics";
import { warnIfNonLoopbackHost } from "./rate-limit";

/**
 * Process-level safety net.
 *
 * This server runs as the sidecar behind the desktop app, where an unhandled
 * rejection taking the process down does not surface as an error — the window
 * simply stops responding. A background provider call that rejects must not be
 * able to do that, so rejections are logged and survived. An uncaught exception
 * leaves genuinely unknown state, so it is logged and the process still exits,
 * which lets the host restart it cleanly.
 */
process.on("unhandledRejection", (reason) => {
  const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  log(`unhandled promise rejection (continuing): ${detail}`, "process");
});

process.on("uncaughtException", (error) => {
  log(`uncaught exception, shutting down: ${error.stack ?? error.message}`, "process");
  process.exit(1);
});

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
  // Feed the opt-in, local-only diagnostics ring. The recorder redacts anything
  // that looks like a secret or an email before it is kept.
  recordDiagnostic(message, source);
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
  // L-904: surface the single-user/loopback assumption if someone binds wider.
  warnIfNonLoopbackHost(host, (message) => log(message, "process"));
  const { root } = getEnvFilePaths();
  const secretsBackend = await (await import("./keychain")).resolveSecretsBackend();
  // A port collision is the most common launch failure and its raw stack says
  // nothing useful; name the port and who to blame instead.
  httpServer.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      log(`fatal: port ${port} on ${host} is already in use. Stop the other process or set PORT.`, "process");
    } else if (error.code === "EACCES") {
      log(`fatal: not permitted to bind ${host}:${port}. Choose a port above 1024 via PORT.`, "process");
    } else {
      log(`fatal: server error: ${error.message}`, "process");
    }
    process.exit(1);
  });

  // Close in-flight connections before exiting so the desktop host can restart
  // the sidecar without leaving a half-written render or a stale listener.
  let shuttingDown = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      log(`received ${signal}, shutting down`, "process");
      httpServer.close(() => process.exit(0));
      // Do not let a hung keep-alive connection block exit indefinitely.
      setTimeout(() => process.exit(0), 5_000).unref();
    });
  }

  httpServer.listen(
    {
      port,
      host,
    },
    () => {
      log(`serving on ${host}:${port} (secrets root: ${root}; secrets: ${secretsBackend})`);
    },
  );
})().catch((error: unknown) => {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  log(`fatal: server failed to start: ${detail}`, "process");
  process.exit(1);
});
