import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  createCalendarItem,
  deleteCalendarItem,
  listCalendarItems,
  updateCalendarItem,
} from "./content-calendar";
import { getStudioMirrorStatus, studioMetricsPlaceholder } from "./studio-oauth";

describe("content calendar", () => {
  const roots: string[] = [];

  after(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  });

  async function tempRoot() {
    const root = await mkdtemp(path.join(os.tmpdir(), "cutroom-cal-"));
    roots.push(root);
    return root;
  }

  it("creates, updates, lists, and deletes items", async () => {
    const root = await tempRoot();
    const created = await createCalendarItem({
      theme: "Competitor teardown week",
      plannedDate: "2026-09-01",
      notes: "Three shorts from one long script",
    }, root);
    assert.equal(created.status, "idea");
    assert.equal(created.theme, "Competitor teardown week");

    const updated = await updateCalendarItem({
      id: created.id,
      status: "scripted",
    }, root);
    assert.equal(updated.status, "scripted");

    const listed = await listCalendarItems(root);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, created.id);

    const deleted = await deleteCalendarItem(created.id, root);
    assert.equal(deleted.success, true);
    assert.equal((await listCalendarItems(root)).length, 0);
  });
});

describe("studio oauth scaffold", () => {
  it("returns requires_studio labels without inventing metrics", () => {
    const status = getStudioMirrorStatus();
    assert.equal(status.label, "Observed-for-owner");
    assert.equal(status.evidenceClass, "requires_studio");
    assert.equal(typeof status.message, "string");
    assert.equal(status.message.length > 20, true);

    const metrics = studioMetricsPlaceholder("abc123");
    assert.equal(metrics.metrics, null);
    assert.equal(metrics.videoId, "abc123");
    assert.equal(metrics.evidenceClass, "requires_studio");
  });
});
