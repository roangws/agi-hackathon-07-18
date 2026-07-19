# Cotal Care Deck

**Slack for clinical agents, with a memory that outlives the shift.**

Built for the AGI Summit 2026 Hackathon, Cotal track.

**Live:** https://cotal-deck.insforge.site

> Kill a working agent — a real `SIGKILL` on a real OS process — mid-patient-handoff.
> Another agent claims the task through anycast, replays the durable log, and resumes
> from the exact bookmark. **The agent dies. The handoff never drops. The audit trail
> shows everything.**

---

## The problem

- The Joint Commission has estimated that **80% of serious medical errors involve
  miscommunication during handoffs** — shift changes, unit transfers, discharges.
- Handoffs fail for a simple reason: the state of the work lives in someone's head
  (or in a process that just crashed), not in a durable, ordered, replayable record.
- As hospitals adopt AI agents for operations, the same failure mode returns worse:
  an agent process dies mid-task and its work evaporates.

## The insight

**Continuity of care is continuity of compute.** If every step of every handoff rides
a durable log, then no crash, restart, or shift change can drop a patient — and the
same log that makes the mesh crash-proof *is* the compliance-grade audit trail.

## What we built

A hospital operations command center run by **8 real agent processes** (triage,
pharmacy med-rec, discharge, bed flow, labs, imaging, transport, charge-nurse
orchestrator) over a Cotal-style mesh:

- **Real work**: FHIR-shaped synthetic tasks (discharge summaries, med
  reconciliation, triage, bed assignment, lab follow-up); every step is a real LLM
  call (Claude via GMI Cloud) whose artifact is durably logged to InsForge Postgres
  **before** the task's bookmark advances.
- **Real death**: the Kill button (or your own `kill -9`) SIGKILLs a worker process.
  Its heartbeat lapses; the task is orphaned.
- **Real anycast**: idle agents race an atomic conditional `UPDATE`; exactly one wins
  the orphaned task (we ship the race test).
- **Real resume**: the winner replays the task's durable log and resumes at
  bookmark + 1. Machine-verified invariant: *every step logged exactly once* —
  no step repeated, none lost.
- **Real replay**: reload the page and the deck rebuilds the entire history from
  Postgres — the audit trail in action.
- **Live chat**: talk to any agent; a real GMI Cloud model answers in that agent's
  clinical-ops persona.
- **ED surge beat**: a deployed RunType agent triages a live surge scenario.

Synthetic data only — no real PHI. Agents are **operations assist**, not clinical
decision-making.

## Why it matters (business)

- **Wedge**: hospital ops automation (handoffs, discharge coordination, bed flow) —
  measurable in length-of-stay and left-without-being-seen metrics.
- **Moat**: the durable log doubles as the **HIPAA-friendly audit artifact** every
  compliance office asks for the moment you put agents near patient workflows.
  Resilience and auditability come from the same primitive.
- **Model**: per-facility SaaS for the mesh + compliance reporting add-on; the same
  engine generalizes to any regulated ops domain (pharmacy chains, clinical trials).

## The real Cotal mesh (proof it's genuinely running)

The deck is the visualization; underneath we run the actual open-source Cotal mesh
(`npx cotal-ai`, Apache-2.0). Bring it up and put a real multi-agent team on it:

```bash
npx cotal-ai setup --demo        # personas: david (engineer), sven (guide), me
npx cotal-ai up --detach         # nats-server + JetStream + manager + delivery daemon
npx cotal-ai spawn david --detach
npx cotal-ai spawn sven  --detach
npx cotal-ai web                 # live dashboard + graph at http://127.0.0.1:7799
```

Interact with it live and watch the graph react in real time:

```bash
cotal send msg build "ship it"      # post to a channel
cotal send dm  david "review this"  # direct-message an agent
cotal send ask engineer "..."       # anycast to any agent of a role
cotal attach --name david           # take over an agent's terminal and drive it
cotal console --plain               # stream the durable, replayable log
```

Cotal is self-hosted (no cloud SaaS), so to show the real mesh on a public URL we tunnel the
local dashboard, e.g. `cloudflared tunnel --url http://127.0.0.1:7799`.

## Proving live usage to judges

Each product exposes the work in its own surface — trigger an action in the deck, then show the
effect in the vendor's console:

| Product | Open this | Live proof |
| --- | --- | --- |
| Cotal | the mesh graph (dashboard / tunnel) | real spawned agents (david, sven) on `#general`; `cotal send` shows up instantly |
| InsForge | project dashboard → `mesh_events` table | row count climbs as the deck runs; log restores from Postgres on reload |
| RunType | the product's REST surface / runs | Trigger Incident → a live `/dispatch` call returns the triage line |
| GMI Cloud | the deck's chat composer | talk to an agent → a real Claude-Haiku-4.5 reply via GMI serving |

## Try it

```bash
node engine/seed.js          # reseed synthetic patients + tasks
node server.js --mesh        # deck + 8 real agent worker processes
# open http://localhost:8099/          → live mode (real agents)
# open http://localhost:8099/?mode=demo → projector-safe scripted mode
```

Tests:

```bash
node engine/test-claim.js    # anycast atomicity: exactly one winner per race
node engine/test-resume.js   # kill mid-task → rescue resumes at bookmark, zero repeats
```

The deployed site runs the scripted demo plus live census/chat; the full
kill-a-real-process beat runs from the laptop fleet (edge functions can't host
long-lived workers).

## Stage moments

| Control | Moment |
| --- | --- |
| Kill Working Agent (`K`) | real SIGKILL → heartbeat lapse → anycast rescue → resume from bookmark → **"HANDOFF NEVER DROPPED"** |
| Trigger Incident (`I`) | ED surge; a real RunType agent returns live ops triage |
| Replay / reload (`R`) | entire ordered history replays from the durable log |
| Chat composer | any agent answers live via a GMI Cloud model |
| Census tab | synthetic patient board with per-handoff progress, owner, acuity |

## Stack

| Piece | Role |
| --- | --- |
| Cotal | the mesh concept: channels, presence, anycast, durable log |
| InsForge | Postgres durable log + tables, edge functions, Sites hosting |
| GMI Cloud | LLM inference for every agent step + chat (Claude Haiku), image gen for visuals |
| RunType | deployed surge-triage agent |
| Engine | zero-dependency Node: 8 worker processes, heartbeats, atomic claims |

For the full technical write-up see `CARE_DECK.md`.

---

*Built at the AGI Hackathon, July 18–19, 2026. Synthetic data only; not a medical device.*
