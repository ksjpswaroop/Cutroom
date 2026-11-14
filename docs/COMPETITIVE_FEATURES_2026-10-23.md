# Cutroom — Competitive Feature Measurement

**As of 2026-10-23.** Supersedes the undated competitor map in [STRATEGY.md](STRATEGY.md) §3–§4 (that file is left
unedited; this is a new dated measurement). Companion: [FEATURES.md](FEATURES.md) (what we ship, measured).

**Method.** Competitor rows are *reads*: each vendor's live homepage / pricing page fetched on 2026-10-23 and quoted
verbatim. Cutroom rows are *measurements*: route call sites parsed in `server/routes.ts`, schema constants read from
`shared/`, and the test that governs the claim named. Legend: **●** published/measured · **◐** partial · **○** not
published (we read the pages listed in §7 and found no such claim) · **n/m** not measured.

---

## 1. What moved since the STRATEGY.md map

| Item | STRATEGY.md (undated) | Measured 2026-10-23 | Who moved |
| --- | --- | --- | --- |
| invideo AI positioning | "AI video from prompt" | Now sells **Storyboarding** ("shot-by-shot plan"), **Script writing**, AI Thumbnail Maker, voice cloning, "bring your own agents" | invideo moved into our script→board lane |
| Board / shot list | Listed as a v3 plan | Shipped: board, camera tree, continuity, subset checks (L-709–L-713) | us |
| Video generation | Cutroom "does not generate video" | `cinematic` calls **MiniMax Hailuo H3** when a key is set (`usesH3: true`, `server/render-engine.ts:186`); stills fallback otherwise; `slides` muxes voice. `usesVeo: false` | us |
| Evidence classes | "evidence ledger" mentioned, no competitor comparison | Zero competitor pages mention citations/evidence (term sweep, §6) | unchanged — our lane is still uncontested on the published surface |
| Direct publish | Not compared | vidIQ publishes from dashboard; OpusClip ships a social scheduler | them |
| Pricing | "~$25–39/mo class" estimate | Exact published list prices captured, §4 | measured now |

## 2. Verdict

Cutroom's defensible ground is **the pre-publish evidence desk**: public YouTube data → claims that are labeled
Observed / Inferred / Requires Studio and traceable to source video IDs → script → board → package, running local on
the user's own keys. No vendor page we read publishes anything like the evidence classes or claim-to-source binding.

Cutroom loses on **production and distribution**: one video model against their stacks (MiniMax Hailuo H3 vs invideo /
Pictory / VEED / CapCut multi-model menus), no editing or repurposing (Descript, OpusClip, CapCut), no keyword volume or
outlier scoring (vidIQ), and no publishing (vidIQ, OpusClip). The last two are deliberate; this document says so rather
than pretending parity.

## 3. Feature matrix

| Capability | Cutroom | invideo | Pictory | Descript | OpusClip | VEED | CapCut | vidIQ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| YouTube keyword/topic research in-product | ● | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| Channel-first competitor research | ● | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| Outlier / virality scoring | ○ | ○ | ○ | ○ | ◐ | ○ | ○ | ● |
| Public captions + comments as research inputs | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Evidence classes (observed / inferred / requires studio) | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Claim → source-video binding | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| AI script writing | ● | ● | ● | ◐ | ○ | ● | ○ | ● |
| Storyboard / shot-by-shot plan | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ |
| Camera tree + continuity rail + board checks | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Teleprompter | ● | ○ | ○ | ○ | ○ | ● | ○ | ○ |
| AI thumbnail generation | ● | ● | ○ | ● | ● | ○ | ○ | ● |
| Thumbnail critique / A-B test | ◐ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| Publish package (titles, tags, description, chapters) | ● | ○ | ○ | ◐ | ○ | ○ | ○ | ● |
| Generative video from script | ● | ● | ● | ○ | ○ | ● | ● | ○ |
| Long-form → Shorts repurposing | ◐ | ◐ | ◐ | ● | ● | ◐ | ● | ● |
| Direct publish / upload to YouTube | ○ | ○ | ○ | ◐ | ● | ○ | ○ | ● |
| Runs local, no account, bring your own keys | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Desktop app | ● | ◐ | ○ | ● | ○ | ○ | ● | ○ |
| Open source (Apache-2.0) | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |

Reading the matrix: our ● rows are all *pre-production* and *trust*; their ● rows are all *production*, *growth*, or
*distribution*. The only true head-to-head collision is **storyboard/shot plan**, which invideo now publishes.

## 4. Published pricing (list price, read 2026-10-23)

| Product | Entry published price | Exact string on page | Free tier |
| --- | --- | --- | --- |
| Cutroom | $0 licence; user pays providers | Apache License 2.0 (`LICENSE`), no billing/subscription code in `client/`, `server/`, `shared/` | n/a — free product |
| invideo | Starter **$20/mo** ($10/mo billed annually) | "400 credits per seat/mo $20 $10 per seat/mo, billed annually" | ○ |
| Pictory | Starter **$29/mo** ($25/mo billed annually) | "Starter $25 Was $29 … per month, billed annually per month, billed monthly" | trial only ("Start free trial") |
| Descript | Hobbyist **$24/mo** ($16/mo annual) | "Hobbyist $ 16 $ 24 per person / month" | ○ ("Free to Start" in title, no $0 row) |
| OpusClip | Starter **$15/mo** | "$15 billed monthly 150 credits per month" | trial ("No credit card required") |
| vidIQ | **$0** free plan; Boost **$19/mo** or $199/yr | "Boost $19 /month or $199 /year; MAX $49 /month or $468 /year" | ● ("Free $0") |
| VEED | n/m — pricing table renders client-side behind a plan selector | — | n/m |
| CapCut | n/m — credit/per-second model ("Seedance 2.5 from $0.12/sec") | — | ● (free editor) |

Cutroom's cost story is different in kind, not degree: the software is free and the bill is whatever the user's own
Gemini / OpenAI / Ollama usage costs. That also means **we have no revenue line** — the honest counterweight.

## 5. Where each vendor beats us

| Vendor | Their published claim (verbatim) | What it means for us |
| --- | --- | --- |
| invideo | "Storyboarding — Turn any script or idea into a shot-by-shot plan, then tweak as needed before generating." | Direct collision with our Board; theirs feeds generation, ours feeds filming |
| invideo | "Script writing — Write your script inside invideo" | They own script→video in one room; we stop at ready-to-produce |
| Pictory | "Idea to Video … Script to Video … AI Script Generator" | End-to-end assembly we do not do |
| Descript | "Instantly add captions, generate a thumbnail and YouTube description." | Post-production packaging from real footage |
| OpusClip | "Social scheduler — Schedule a month's posts to all platforms in 10 minutes." | Distribution we deliberately exclude |
| VEED | "Teleprompter" (and "AI Script Generator") | Our teleprompter is not unique; it is table stakes in this class |
| vidIQ | "Find Winning Keywords … real search volume, competition scores"; "Find Viral Ideas … outlier videos" | The research axis where we are weakest: no volume, no outlier score |
| CapCut | "Long video to short videos"; "AI video generator" | Free editing + generation at massive distribution |

## 6. Term sweep — the absence we are claiming

Parsed visible text of all pages in §7 (13 documents). Case-insensitive hit counts across the whole fetched set:

| Term group | Hits on competitor surfaces |
| --- | --- |
| `citation · cited · evidence · verifiable · source-linked` | **0** |
| `local-first · offline · on-device` | **0** |
| `API key · bring your own key · BYOK` | **0** (invideo's "Bring your own agents" is about agent tools, not keys) |
| `obsidian`-class evidence labeling (observed/inferred/requires studio) | **0** |

That is the whole of our positioning claim on the published surface: *they have not published X; we ship X with the
evidence in §8*. It is not "they cannot do it" — an unlogged-in reader cannot see inside their products, and this
document does not pretend otherwise.

## 7. Surfaces read (all fetched 2026-10-23)

| Vendor | Pages |
| --- | --- |
| invideo | `invideo.io/perfv2/homepage/`, `invideo.io/pricing/` |
| Pictory | `pictory.ai/`, `pictory.ai/pricing` |
| Descript | `descript.com/`, `descript.com/pricing` |
| OpusClip | `opus.pro/`, `opus.pro/pricing` |
| VEED | `veed.io/`, `veed.io/pricing` |
| vidIQ | `vidiq.com/`, `vidiq.com/pricing/` |
| CapCut | `capcut.com/`, `capcut.com/pricing` |
| Canva | **not reachable** — Cloudflare challenge on both curl and headless browser (HTTP 403 + interstitial) |

Not re-measured this pass, so **absent from the matrix**: TubeBuddy, 1of10, OutlierKit, OverseerOS, TubeAI (all
named in STRATEGY.md §3) and Canva. Their rows in STRATEGY.md are carried forward, undated, and should be treated as
unverified until fetched.

## 8. Provenance — Cutroom side (measured, not read from docs)

| Claim | How measured | Result |
| --- | --- | --- |
| API surface size | parsed `app.` route registrations (get/post/put/delete) in `server/routes.ts` | **43** routes |
| YouTube search, 1–50 results | `shared/schema.ts:99` `maxResults: z.number().min(1).max(50).default(25)`; route `server/routes.ts:438` | ● |
| Channel-first research | `channelId` on `search.list`, asserted by `server/youtube.test.ts` ("sends channelId on search.list when Research is channel-first (L-618)") | ● |
| Captions as evidence | `POST /api/research/captions` (`routes.ts:477`), public captions only | ● |
| Comment mining | `POST /api/research/comment-questions` (`routes.ts:515`) | ● |
| Evidence classes | `shared/evidence-contracts.ts:6` `z.enum(["observed","inferred","requires_studio"])` + rule at `:18` (observed requires ≥1 source video id) | ● |
| Claim → source binding | same contract; throughline test suite in `shared/throughline.test.ts` | ● |
| Board | `POST /api/package/production-board` (`routes.ts:765`), contracts in `shared/board-contracts.ts` | ● |
| Thumbnail generate + critique | `routes.ts:672`, `routes.ts:786`; ≤3 references, `referenceRightsConfirmed` gate in `server/thumbnail-contract.ts:179` | ● / ◐ (no A/B) |
| Render engines | `shared/render-contracts.ts:4` `z.enum(["assemble","shoot","slides","cinematic"])`; `POST /api/preview/render` (`routes.ts:373`) | ● (H3 BYOK; no Veo) |
| No direct upload | `server/render-engine.test.ts:70` asserts `server/routes.ts` contains no `videos.insert` — passes | ○ by design |
| Local-only, no account | `server/index.ts:134` binds `HOST` to `127.0.0.1` by default; no auth middleware; keys in macOS keychain (`server/keychain.ts:8`) | ● |
| Free / open source | `LICENSE` = Apache License 2.0; no stripe/checkout/subscription/paywall match in `client/src`, `server`, `shared` | ● |
| Gate state | `npm test` 243/243 · `npm run check` clean · `npm run build` ok | green |

## 9. Method note — what this document could not do

- **No inside-product verification for any competitor.** Everything on their side is a read of marketing pages. A
  feature their page omits may well exist; ○ means "not published", never "they cannot".
- **One vendor is unreachable** (Canva, Cloudflare). One price is unreadable (VEED, client-rendered). Both are marked
  n/m rather than estimated.
- **Four vendors named in STRATEGY.md were not fetched** this pass. The matrix does not include them at all.
- **The comparison axis is our own feature set** — that flatters us structurally. The rows where we score ○ are the
  ones a buyer of *video* will feel most; §5 exists for that reason.
- **Pricing is list price on the page**, before regional pricing, annual discounts, credit top-ups, or seat minimums.
- A prior STRATEGY.md claim — competitor pricing "~$25–39/mo class" — is superseded by the exact strings in §4.

## 10. Sources

- invideo: https://invideo.io/perfv2/homepage/ · https://invideo.io/pricing/
- Pictory: https://www.pictory.ai/ · https://www.pictory.ai/pricing
- Descript: https://www.descript.com/ · https://www.descript.com/pricing
- OpusClip: https://www.opus.pro/ · https://www.opus.pro/pricing
- VEED: https://www.veed.io/ · https://www.veed.io/pricing
- vidIQ: https://vidiq.com/ · https://vidiq.com/pricing/
- CapCut: https://www.capcut.com/ · https://www.capcut.com/pricing
- Canva: https://www.canva.com/ (403 — not measured)
