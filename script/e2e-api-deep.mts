/**
 * Deep API happy / edge / negative suite against local Cutroom server.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.TEST_URL || "http://127.0.0.1:5050";
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "tmp-artifacts/e2e-report/api-deep.json");

type Row = {
  id: string;
  name: string;
  category: "happy" | "edge" | "negative";
  method: string;
  path: string;
  expected: number | number[];
  actual: number;
  passed: boolean;
  notes?: string;
  bodySnippet?: string;
};

async function req(
  method: string,
  p: string,
  opts: { body?: unknown; origin?: string | null; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.origin === null) {
    // omit Origin
  } else if (opts.origin !== undefined) {
    headers.Origin = opts.origin;
  } else {
    headers.Origin = BASE;
  }
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + p, {
    method,
    headers,
    body: opts.body !== undefined ? (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* raw */
  }
  return { status: res.status, text, json };
}

function expectOk(expected: number | number[], actual: number) {
  return Array.isArray(expected) ? expected.includes(actual) : expected === actual;
}

async function main() {
  await mkdir(path.dirname(OUT), { recursive: true });
  const rows: Row[] = [];

  async function case_(
    id: string,
    name: string,
    category: Row["category"],
    method: string,
    p: string,
    expected: number | number[],
    opts: Parameters<typeof req>[2] = {},
    check?: (r: Awaited<ReturnType<typeof req>>) => string | void,
  ) {
    const r = await req(method, p, opts);
    const notes = check?.(r) || undefined;
    const passed = expectOk(expected, r.status) && !notes?.startsWith("FAIL:");
    rows.push({
      id,
      name,
      category,
      method,
      path: p,
      expected: Array.isArray(expected) ? expected[0]! : expected,
      actual: r.status,
      passed: passed && (Array.isArray(expected) ? expected.includes(r.status) : r.status === expected),
      notes: notes || (Array.isArray(expected) && !expected.includes(r.status) ? `expected one of ${expected.join(",")}` : undefined),
      bodySnippet: r.text.slice(0, 280),
    });
    // fix passed when array expected
    rows[rows.length - 1]!.passed = expectOk(expected, r.status) && !(notes && notes.startsWith("FAIL:"));
    console.log(`${rows[rows.length - 1]!.passed ? "PASS" : "FAIL"} ${id} ${r.status} ${name}`);
  }

  // Status / config
  await case_("API-01", "settings status", "happy", "GET", "/api/settings/status", 200, {}, (r) => {
    const j = r.json as any;
    if (!j || typeof j !== "object") return "FAIL: no json";
    const leaked = JSON.stringify(j).match(/AIza[0-9A-Za-z_-]{20,}|sk-[a-zA-Z0-9]{20,}/);
    if (leaked) return "FAIL: possible API key leaked in status response";
  });
  await case_("API-02", "youtube quota", "happy", "GET", "/api/youtube/quota", 200);
  await case_("API-03", "workflows list", "happy", "GET", "/api/workflows", 200);
  await case_("API-04", "studio status", "happy", "GET", "/api/studio/status", 200);
  await case_("API-05", "calendar list", "happy", "GET", "/api/calendar", 200);

  // Search happy (GET)
  await case_(
    "API-06",
    "youtube search happy",
    "happy",
    "GET",
    "/api/youtube/search?q=" + encodeURIComponent("standing desk reviews") + "&maxResults=5",
    200,
    {},
    (r) => {
      const j = r.json as any;
      const videos = j?.videos || j?.items || [];
      if (!Array.isArray(videos) || videos.length === 0) return "FAIL: no videos returned";
      return `videos=${videos.length}`;
    },
  );

  await case_(
    "API-07",
    "youtube channel-scoped search",
    "happy",
    "GET",
    "/api/youtube/search?q=review&channelId=UC_x5XG1OV2P6uZZ5FSM9Ttw&maxResults=3",
    200,
    {},
    (r) => {
      const j = r.json as any;
      const videos = j?.videos || j?.items || [];
      return `videos=${Array.isArray(videos) ? videos.length : 0}`;
    },
  );

  // Origin / loopback edges
  await case_("API-08", "calendar without Origin (loopback)", "edge", "GET", "/api/calendar", [200, 403], { origin: null });
  await case_("API-09", "calendar evil Origin", "negative", "GET", "/api/calendar", 403, { origin: "https://evil.example" });
  await case_("API-10", "settings status evil Origin", "negative", "GET", "/api/settings/status", [200, 403], {
    origin: "https://evil.example",
  }, (r) => {
    // status may be public; note behavior
    return `status=${r.status}`;
  });

  // Search negatives / edges
  await case_("API-11", "search empty q", "negative", "GET", "/api/youtube/search?q=", 400);
  await case_("API-12", "search missing q", "negative", "GET", "/api/youtube/search", 400);
  await case_("API-13", "search whitespace q", "negative", "GET", "/api/youtube/search?q=%20%20%20", [400, 200]);
  await case_("API-14", "search invalid channelId", "negative", "GET", "/api/youtube/search?q=desk&channelId=not-a-channel", [400, 502], {}, (r) => {
    if (r.status === 502) return "ISSUE: invalid channelId returns 502 instead of 400";
  });
  await case_("API-15", "search POST method not registered", "negative", "POST", "/api/youtube/search", 404, {
    body: { query: "desk" },
  });
  await case_("API-16", "unknown API route", "negative", "GET", "/api/this-does-not-exist", 404);

  // Empty body negatives
  await case_("API-17", "ideas empty videos", "negative", "POST", "/api/ideas/generate", 400, { body: { videos: [] } });
  await case_("API-18", "insights empty", "negative", "POST", "/api/research/insights", 400, { body: {} });
  await case_("API-19", "script empty", "negative", "POST", "/api/script/generate", 400, { body: {} });
  await case_("API-20", "thumbnail empty", "negative", "POST", "/api/thumbnail/generate", 400, { body: {} });
  await case_("API-21", "package empty", "negative", "POST", "/api/package/generate", 400, { body: {} });
  await case_("API-22", "clip-briefs empty", "negative", "POST", "/api/package/clip-briefs", 400, { body: {} });
  await case_("API-23", "bad JSON body", "negative", "POST", "/api/ideas/generate", [400, 500], {
    body: "not-json",
    headers: { "Content-Type": "application/json" },
  });

  // Calendar
  const theme = `e2e-api-${Date.now()}`;
  await case_("API-24", "calendar create ok", "happy", "POST", "/api/calendar", 201, {
    body: { theme, plannedDate: "2026-09-15" },
  });
  await case_("API-25", "calendar create empty theme", "negative", "POST", "/api/calendar", 400, {
    body: { theme: "", plannedDate: "2026-09-15" },
  });
  await case_("API-26", "calendar XSS theme stored (escaped client-side expected)", "edge", "POST", "/api/calendar", [201, 400], {
    body: { theme: "<script>alert(1)</script>", plannedDate: "2026-09-16" },
  }, (r) => (r.status === 201 ? "stored raw script tag in theme — verify UI escapes" : undefined));
  await case_("API-27", "calendar bad date", "edge", "POST", "/api/calendar", [201, 400], {
    body: { theme: "bad-date-e2e", plannedDate: "not-a-date" },
  }, (r) => (r.status === 201 ? "ISSUE: invalid plannedDate accepted" : undefined));

  // Chain: search → ideas (if search worked)
  const search = await req(
    "GET",
    "/api/youtube/search?q=" + encodeURIComponent("productivity desk setup") + "&maxResults=5",
  );
  const videos = ((search.json as any)?.videos || []) as any[];
  if (search.status === 200 && videos.length > 0) {
    await case_("API-28", "ideas generate from search", "happy", "POST", "/api/ideas/generate", 200, {
      body: { videos: videos.slice(0, 5), query: "productivity desk setup" },
    }, (r) => {
      const j = r.json as any;
      const ideas = j?.ideas || j?.groundedIdeas || [];
      if (!Array.isArray(ideas) || ideas.length === 0) return "FAIL: no ideas";
      return `ideas=${ideas.length}`;
    });
  } else {
    rows.push({
      id: "API-28",
      name: "ideas generate from search",
      category: "happy",
      method: "POST",
      path: "/api/ideas/generate",
      expected: 200,
      actual: search.status,
      passed: false,
      notes: "skipped — search failed or empty",
    });
  }

  await writeFile(
    OUT,
    JSON.stringify(
      {
        base: BASE,
        at: new Date().toISOString(),
        passed: rows.filter((r) => r.passed).length,
        total: rows.length,
        rows,
      },
      null,
      2,
    ),
  );
  console.log(`\nAPI deep ${rows.filter((r) => r.passed).length}/${rows.length} → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
