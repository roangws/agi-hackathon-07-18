# Cotal Care Deck — Healthcare Pivot + Real Mesh Engine

Date: 2026-07-18
Status: Approved (user: "conceptually fine, use artificial data, show something really cool")

## Goal

Score 100 on the hackathon rubric:
- Innovation & Originality (20%)
- Technical Execution & Agentic Depth (25%)
- Impact & Usefulness (20%)
- Product Experience / Demo (20%)
- Business Potential & Scalability (15%)

Pivot the existing Cotal Command Deck (generic multi-agent mesh visualization) into a
**hospital command center** where the durable-log mesh guarantees that clinical handoffs
are never dropped — and replace the scripted core beats with a **real agent engine**.

**Positioning:** "Slack for clinical agents, with a memory that outlives the shift."
Money-shot narrative: shift change is where patients get dropped; this mesh never drops a
handoff, and its durable log doubles as the audit trail.

## Constraints

- Keep the sponsor stack: Cotal mesh concept, InsForge (Postgres, edge functions, Sites
  hosting), RunType (incident triage flow), GMI Cloud (LLM inference + image generation).
- Synthetic data only. No real PHI, ever.
- Scope note in all copy: agents are *operations assist*, not clinical decision-making
  (stay out of FDA-claim territory).
- Keep the current scripted experience as a projector-safe fallback mode.

## Architecture

### Data model (FHIR-shaped, in InsForge Postgres)

- `patients`: ~12 synthetic FHIR `Patient` resources (MRN, name, age, conditions).
- `care_tasks`: FHIR `Task`-shaped rows — `status`, `focus` (patient ref), `owner_agent`,
  `heartbeat_at`, `bookmark` (last durably-logged step index), `steps` (jsonb array of
  step definitions). Templates: triage assessment, medication reconciliation, discharge
  summary, bed assignment, lab follow-up.
- `mesh_log`: ordered durable events (`seq`, `ts`, `agent`, `channel`, `kind`, `body`,
  `task_id`). Single source of truth for replay and the audit-trail story.
- Seed generator script produces all synthetic data.

### Agent roster (8 — personas kept, clinical roles)

| Agent | Role |
| --- | --- |
| Atlas | Charge-nurse orchestrator |
| Iris | Triage |
| Nova | Pharmacy / med reconciliation |
| David | Discharge coordinator |
| Sven | Bed flow |
| Echo | Labs |
| Vega | Imaging |
| Zephyr | Transport |

GMI live-chat personas rewritten to match roles.

### Real mesh engine

- `agents.js`: Node parent spawns 8 real worker child processes, one per agent.
- Worker loop: claim task → execute steps → heartbeat every ~2s.
- Step execution = real GMI/Claude call producing a clinical artifact (e.g. discharge
  summary paragraph), durably written to `mesh_log`. Bookmark advances only after the
  step is durably logged.
- **Kill is real**: UI kill button → server SIGKILLs the worker process (a judge can also
  `kill -9` from a terminal). Heartbeat lapses → task released → eligible workers race an
  atomic `UPDATE care_tasks SET owner_agent = $me WHERE id = $id AND owner_agent IS NULL
  RETURNING *` (real anycast). Winner replays `mesh_log` for that task and resumes from
  bookmark + 1 — no work repeated, no work lost.
- Frontend consumes engine events through the existing `say()` / `log()` /
  `setPresence()` / `pulse()` seams.
- Modes: `?mode=live` (real engine, default when backend reachable) and `?mode=demo`
  (current scripted path, projector-safe). Backend down → auto-fallback + banner.

### Demo beats (live mode)

- **Kill / resume**: real, as above. Banner: "HANDOFF NEVER DROPPED" + audit-trail flash.
- **Incident** → "rapid response / ED surge": RunType flow kept; agents swarm the channel.
- **Replay**: page reload replays full ordered history from Postgres.
- **Live chat**: kept (GMI), clinical personas.

### UI + copy

- Channels → `#handoffs`, `#rapid-response`, `#pharmacy`, `#bed-flow`.
- New patient census panel: patients + their active tasks.
- Calm clinical palette pass; orb aesthetic stays; optional image regen via
  `gen_images.py` with clinical prompts.

### Pitch layer

- README rewritten as a pitch: handoff-failure problem (cited stat), durable log as
  compliance artifact (HIPAA audit angle), market, business path.
- 90-second stage script updated for the healthcare narrative.

### Deployment

- Frontend + edge-function proxies: InsForge Sites (as today).
- Worker fleet: runs on the demo laptop (`node agents.js`) against InsForge Postgres —
  edge functions cannot host persistent workers.

## Error handling

- GMI call failure mid-step → canned step text, step still durably logged (engine
  liveness never depends on the LLM).
- Backend unreachable → frontend auto-falls back to demo mode with a visible banner.
- Heartbeat/claim tuning: heartbeat ~2s, stale threshold ~5s.

## Testing

- Node test: claim atomicity (two workers race, exactly one wins).
- Node test: bookmark-resume correctness (kill after step N, new owner starts at N+1).
- End-to-end kill test via the server endpoint.
- Scripted-mode regression: page loads, beats fire.
- Deploy check on InsForge Sites.
