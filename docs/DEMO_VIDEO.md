# Demo video — shot list + voiceover (target ≤ 2:30)

Setup before recording: `curl -X POST localhost:8099/mesh/reset`, browser at
`http://localhost:8099/` full-screen, terminal window ready on second half of
screen for the kill-9 beat. QuickTime → New Screen Recording → record the browser.

| # | Time | On screen | Voiceover |
|---|------|-----------|-----------|
| 1 | 0:00–0:15 | Live deck, agents claiming work, census tab | "The Joint Commission attributes 80% of serious medical errors to handoff miscommunication. This is Cotal Care Deck — a hospital ops mesh run by eight REAL agent processes. Every step you see is a real Claude call, durably logged to Postgres before the work advances." |
| 2 | 0:15–0:35 | Census tab: blocked chain "⛓ waiting on Med rec", then DM in feed | "Tasks chain like real care: transport can't claim until the bed is assigned. When a prerequisite finishes, the agent DMs the specialist — real coordination, all in the durable log." |
| 3 | 0:35–1:15 | Terminal: `curl -X POST localhost:8099/mesh/kill -d '{"agent":"<working agent>"}'` (or press K). Node greys out. | "Now the moment that matters. I'm killing this agent — a real SIGKILL on a real OS process, mid-discharge. Its heartbeat lapses — the mesh waits a deliberate 30-second grace so latency never reads as death — then the handoff is orphaned…" |
| 4 | 1:15–1:35 | Rescue: idle agent claims, HANDOFF NEVER DROPPED toast with bookmark | "…and an idle agent wins an atomic anycast race, replays the log, and resumes at the exact bookmark. No step repeated, none lost. We ship the test that proves it." |
| 5 | 1:25–1:40 | Metrics chips bottom-right | "The proof is computed, not asserted: handoffs done, rescues, average rescue under ten seconds, zero steps repeated, zero handoffs dropped." |
| 6 | 1:40–1:55 | Reload the page → history replays, metrics recompute | "Reload — the entire history rebuilds from the durable log. The same primitive that makes agents crash-proof IS the HIPAA-grade audit trail." |
| 7 | 1:55–2:10 | Chat: ask Atlas "How's the census?" → live grounded reply | "Every agent is live — ask the charge nurse about the census and it answers from the actual data." |
| 8 | 2:10–2:25 | Trigger Incident → RunType triage line | "An ED surge is triaged in real time by a deployed RunType agent — and logged." |
| 9 | 2:25–2:30 | Deck wide shot | "The agent dies. The handoff never drops. The log is the audit trail. Cotal Care Deck." |

Stack shout-out (if time): "Built on Cotal's mesh model, InsForge Postgres and edge
functions, Claude via GMI Cloud, and RunType."

Upload: YouTube (unlisted) or Loom → paste link in Devpost "Demo Video" field.
