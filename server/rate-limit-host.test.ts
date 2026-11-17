import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { warnIfNonLoopbackHost } from "./rate-limit";

describe("rate-limit hosting guard (L-904)", () => {
  test("warns when HOST is non-loopback", () => {
    const logs: string[] = [];
    const warned = warnIfNonLoopbackHost("0.0.0.0", (m) => logs.push(m));
    assert.equal(warned, true);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /single-user local process/);
  });

  test("stays silent on 127.0.0.1", () => {
    const logs: string[] = [];
    assert.equal(warnIfNonLoopbackHost("127.0.0.1", (m) => logs.push(m)), false);
    assert.equal(logs.length, 0);
  });

  test("stays silent on localhost, ::1, and unset", () => {
    const silent = (host: string | undefined) =>
      warnIfNonLoopbackHost(host, () => {
        throw new Error("should not warn");
      });
    assert.equal(silent("localhost"), false);
    assert.equal(silent("::1"), false);
    assert.equal(silent(""), false);
    assert.equal(silent(undefined), false);
  });

  test("warns on an external interface address", () => {
    assert.equal(warnIfNonLoopbackHost("192.168.1.10", () => {}), true);
  });
});
