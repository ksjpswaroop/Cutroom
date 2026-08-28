import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { writeLibraryConfig } from "../server/library-config";
import { listWorkflowRecordsFromDisk, putWorkflowRecordToDisk } from "../server/workflow-store";

async function main() {
  process.env.CUTROOM_APP_DATA = "/tmp/cutroom-appdata-test";
  const pkg = JSON.parse(readFileSync("/tmp/cutroom-package.json", "utf8"));
  const now = Date.now();
  const id = "testwf01-bbbb-cccc-dddd-eeeeeeeeeeee";
  await writeLibraryConfig("/tmp/CutroomLibrary");
  await putWorkflowRecordToDisk({
    id,
    createdAt: now,
    updatedAt: now,
    state: {
      id,
      title: "Standing desk reviews for remote work",
      cachedResearch: {
        query: "Standing desk reviews for remote work",
        videos: [{ id: "v1" }],
        insights: null,
        analytics: null,
        filters: { uploadDate: "any", duration: "any", sortBy: "relevance" },
        timestamp: now,
      },
      cachedScript: {
        script: "# Hook\nMost standing desks fail after six months.",
        topic: "Standing desk reviews for remote work",
        timestamp: now,
      },
      cachedPackage: {
        topic: "Standing desk reviews for remote work",
        publishPackage: pkg,
        productionBrief: null,
        timestamp: now,
      },
    },
  });
  const listed = await listWorkflowRecordsFromDisk();
  console.log("listed", listed.map((record) => ({ id: record.id, title: (record.state as { title?: string }).title })));
  console.log("library entries:", readdirSync("/tmp/CutroomLibrary"));
  const folder = readdirSync("/tmp/CutroomLibrary").find((name) => !name.startsWith("."));
  if (!folder) throw new Error("Missing topic folder");
  console.log("files:", readdirSync(path.join("/tmp/CutroomLibrary", folder)));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
