import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

export interface RateLimiterOptions {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
}

/**
 * In-process token bucket for expensive provider routes.
 * Default ceiling is intentionally higher than a single Research→Ideas→Script
 * burst so Insights + Ideas can complete back-to-back on one machine.
 */
export function createRateLimiter(options: RateLimiterOptions = {}) {
  const maxRequests = options.maxRequests ?? 48;
  const windowMs = options.windowMs ?? 60_000;
  const now = options.now ?? Date.now;
  const store = new Map<string, { count: number; resetTime: number }>();
  let requestCount = 0;

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    const token = req.ip || req.socket.remoteAddress || "anonymous";
    const timestamp = now();
    requestCount += 1;
    if (requestCount % 256 === 0 || store.size >= 1_000) {
      for (const [storedToken, storedEntry] of Array.from(store.entries())) {
        if (timestamp >= storedEntry.resetTime) store.delete(storedToken);
      }
    }
    if (store.size >= 10_000 && !store.has(token)) {
      const oldestToken = store.keys().next().value;
      if (oldestToken) store.delete(oldestToken);
    }
    let entry = store.get(token);

    if (!entry || timestamp >= entry.resetTime) {
      entry = { count: 1, resetTime: timestamp + windowMs };
      store.set(token, entry);
      return next();
    }

    if (entry.count >= maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetTime - timestamp) / 1_000));
      res.setHeader("Retry-After", retryAfter.toString());
      return res.status(429).json({
        error: "Too many requests. Please wait before trying again.",
        retryAfter,
      });
    }

    entry.count += 1;
    next();
  };

  return { middleware, store };
}

/** Validate JSON body before rate limiting so 400s do not consume the budget. */
export function requireValidBody<T>(schema: ZodType<T>, errorMessage: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: errorMessage,
        details: parsed.error.errors,
      });
    }
    res.locals.validatedBody = parsed.data;
    next();
  };
}
