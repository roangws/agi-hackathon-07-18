# AGI Hospital: technical write-up

Hospital-operations mesh with a **real agent engine**: real worker processes, real
kill, real anycast claims, real resume from a durable-log bookmark. The deck is the
projector-ready window onto it.

**Live:** https://care-deck.insforge.site · Synthetic data only; ops-assist, not
clinical decision-making.

## Architecture

```
┌────────────────────────── laptop ──────────────────────────┐
│ server.js ── spawns ──► engine/worker.js × 8 (real procs)  │
│    │  /mesh/kill = SIGKILL   /mesh/revive  /mesh/reset     │
│    ▼                                │  every step:         │
│ index.html + app.js + live.js       │  LLM call (Claude) → │
│    (polls state, renders mesh)      │  durable log →       │
└────────┬────────────────────────────┼──── bookmark++ ──────┘
         │                            ▼
   InsForge Postgres:  patients · care_tasks · mesh_log · agent_state
   InsForge edge fns:  gmi-chat (Claude) · rt-triage (RunType)
```

## The invariant (and its proof)

A step is **durably logged before the bookmark advances**. So for any kill at any
moment:

- steps ≤ bookmark: in the log, never re-run
- step bookmark+1: may have run but wasn't logged → safely re-run by the rescuer
- exactly-once *logging* of every step, zero lost work

`engine/test-resume.js` spawns a real worker, SIGKILLs it mid-task, spawns a second
worker, and asserts: task completed by the rescuer, every step number logged exactly
once, rescue event cites the right bookmark, and the work split is real (killed
agent did steps 1..k, rescuer did k+1..n).

## Anycast without a broker

No coordinator hands out orphaned tasks. Idle workers scan for
`status=in_progress AND heartbeat_at < now()-6s` and race a conditional PATCH
(single-statement UPDATE):

```
PATCH /care_tasks?tid=eq.X&heartbeat_at=lt.<stale>   { owner_agent: me, heartbeat_at: now }
```

Exactly one wins; losers see `[]`. A live owner's fresh heartbeat makes the guard
fail, so healthy agents are never robbed. `engine/test-claim.js` proves both races.

## Worker loop (`engine/worker.js <agentId>`)

1. Heartbeat `agent_state` (presence) every 2s; also heartbeat the owned task —
   guarded by `owner_agent=eq.me`, so a rescued-away task is detected and abandoned.
2. Rescue stale handoffs first, else claim new work, else post an idle status line
   (sometimes a live Claude line in persona).
3. Per step: real LLM call → artifact durably logged → bookmark++ → repeat.
   LLM failure falls back to the step's canned text: engine liveness never depends
   on the model.

## Modes

- **live** (default when `/mesh/status` is up): the deck *reports* the fleet —
  polls `mesh_log` (1s), `agent_state` (1.5s), census (2.5s); renders through the
  same `say()/log()/setPresence()/pulse()` seams the script uses.

## Stage script (90 seconds)

1. Open live mode full-screen. *"Eight real agent processes running a hospital's
   operations — every step is a real model call, durably logged to Postgres."*
   Point at the census tab: per-patient handoff progress.
2. Hit **Kill Working Agent** — or, better, ask the judge to pick a victim and run
   `curl -X POST localhost:8099/mesh/kill -d '{"agent":"david"}'` themselves.
   *"That was a real SIGKILL on a real process, mid-discharge."*
3. Watch: heartbeat lapses → node greys out → an idle agent wins the anycast race →
   **HANDOFF NEVER DROPPED** toast with the exact bookmark. *"No step repeated,
   none lost — we ship the test that proves it."*
4. Reload the page. *"The entire history replays from the durable log. Resilience
   and the HIPAA audit trail are the same primitive."*
5. Optional: **Trigger Incident** (live RunType surge triage), then type a message
   to any agent (live Claude reply in persona).

## Controls

| Key / control | Action |
| --- | --- |
| `K` / Kill Working Agent | live: real SIGKILL via `/mesh/kill` · demo: scripted beat |
| `I` / Trigger Incident | ED surge + live RunType triage |
| `R` / Replay | replay the ledger; in live mode a page reload is the real replay |
| Census tab | synthetic patient board, acuity dots, per-handoff progress |
| Composer | live Claude chat with any agent, in clinical-ops persona |
| `?auto=kill\|replay` | kiosk auto-fire (live mode waits for a claim first) |

## Files

- `engine/personas.js` — the 8 clinical agents (roles, colors, personas, channels)
- `engine/db.js` — zero-dep InsForge REST client + atomic `claimNew`/`claimStale`
- `engine/schema.js` / `engine/seed.js` — tables + synthetic FHIR-shaped data
  (12 patients, 12 multi-step tasks)
- `engine/worker.js` — the real agent process
- `engine/test-claim.js` / `engine/test-resume.js` — the two invariant proofs
- `server.js` — static deck, RunType proxy, fleet spawn + `/mesh/*` control
- `live.js` — live-mode adapter (polling → visual seams)
- `app.js` — mesh visuals, scripted fallback beats, chat composer
- `functions/gmi-chat.ts`, `functions/rt-triage.ts` — InsForge edge functions
  keeping model/RunType keys server-side
- `gen_images.py` / `gen_orbs.py` — image asset generation

## Ops notes

- Reset between demos: `curl -X POST localhost:8099/mesh/reset` (reseeds
  patients/tasks/log) or `node engine/seed.js`.
- Killed agents auto-revive ~25s after the beat so the fleet stays full; `/mesh/revive`
  brings one back sooner.
- Keys: `.env` (`INSFORGE_HOST`, `INSFORGE_KEY`, optional `RUNTYPE_*`);
  `insforge-config.js` for the browser. Both gitignored.
