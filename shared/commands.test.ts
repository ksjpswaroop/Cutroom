import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { z } from "zod";
import { createCommandRegistry } from "./commands";

describe("command registry v1 (Cutroom Pro M0)", () => {
  test("register + dispatch runs the handler with validated params", async () => {
    const registry = createCommandRegistry();
    registry.register("pro.ping", {
      description: "Test command.",
      paramsSchema: z.object({ name: z.string().min(1) }).strict(),
      handler: ({ name }) => `hello ${name}`,
    });
    assert.equal(await registry.dispatch("pro.ping", { name: "cutroom" }), "hello cutroom");
    assert.deepEqual(registry.ids(), ["pro.ping"]);
    const [entry] = registry.auditLog();
    assert.equal(entry.command, "pro.ping");
    assert.equal(entry.ok, true);
    assert.equal(entry.seq, 1);
    assert.ok(typeof entry.timestamp === "string" && entry.timestamp.length > 0);
    assert.deepEqual(entry.params, { name: "cutroom" });
  });

  test("duplicate registration is rejected", () => {
    const registry = createCommandRegistry();
    const definition = {
      description: "Test.",
      paramsSchema: z.object({}).strict(),
      handler: () => true,
    };
    registry.register("pro.ping", definition);
    assert.throws(() => registry.register("pro.ping", definition), /already registered/);
  });

  test("unknown command fails and is audited", async () => {
    const registry = createCommandRegistry();
    await assert.rejects(() => registry.dispatch("pro.nope", {}), /Unknown command/);
    const [entry] = registry.auditLog();
    assert.equal(entry.command, "pro.nope");
    assert.equal(entry.ok, false);
    assert.match(entry.error || "", /Unknown command/);
  });

  test("invalid params fail validation, handler never runs", async () => {
    const registry = createCommandRegistry();
    let ran = false;
    registry.register("pro.set-enabled", {
      description: "Test.",
      paramsSchema: z.object({ enabled: z.boolean() }).strict(),
      handler: () => {
        ran = true;
        return true;
      },
    });
    await assert.rejects(() => registry.dispatch("pro.set-enabled", { enabled: "yes" }), /Invalid params/);
    assert.equal(ran, false);
    assert.equal(registry.auditLog()[0].ok, false);
  });

  test("disabled command fails without running the handler", async () => {
    const registry = createCommandRegistry();
    let ran = false;
    registry.register("pro.export-otio", {
      description: "Test.",
      paramsSchema: z.object({}).strict(),
      enabled: () => false,
      handler: () => {
        ran = true;
        return true;
      },
    });
    await assert.rejects(() => registry.dispatch("pro.export-otio", {}), /disabled/);
    assert.equal(ran, false);
    assert.equal(registry.auditLog()[0].ok, false);
  });

  test("handler errors are audited and rethrown", async () => {
    const registry = createCommandRegistry();
    registry.register("pro.boom", {
      description: "Test.",
      paramsSchema: z.object({}).strict(),
      handler: () => {
        throw new Error("boom");
      },
    });
    await assert.rejects(() => registry.dispatch("pro.boom", {}), /boom/);
    const [entry] = registry.auditLog();
    assert.equal(entry.ok, false);
    assert.equal(entry.error, "boom");
  });

  test("audit log is append-only and in dispatch order", async () => {
    const registry = createCommandRegistry();
    registry.register("pro.a", {
      description: "Test.",
      paramsSchema: z.object({}).strict(),
      handler: () => "a",
    });
    registry.register("pro.b", {
      description: "Test.",
      paramsSchema: z.object({}).strict(),
      handler: () => "b",
    });
    await registry.dispatch("pro.a", {});
    await registry.dispatch("pro.b", {});
    await assert.rejects(() => registry.dispatch("pro.missing", {}));
    const log = registry.auditLog();
    assert.deepEqual(log.map((entry) => entry.seq), [1, 2, 3]);
    assert.deepEqual(log.map((entry) => entry.command), ["pro.a", "pro.b", "pro.missing"]);
    // Mutating the returned copy must not rewrite history.
    log[0].ok = false;
    assert.equal(registry.auditLog()[0].ok, true);
  });
});
