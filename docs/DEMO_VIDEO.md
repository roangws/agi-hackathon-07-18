# Demo video — shot list + voiceover (target ≤ 2:10)

Built to hit every judging criterion: impact (shot 1), innovation (shot 2),
technical depth (shots 3 to 5), demo polish (all), business (shot 7).
Every sponsor is named on screen at the moment their tech is doing the work.

Setup before recording: `curl -X POST localhost:8099/mesh/reset`, browser at
`http://localhost:8099/` full screen. QuickTime (⌘⇧5) → record screen.

| # | Time | On screen | Voiceover |
|---|------|-----------|-----------|
| 1 | 0:00–0:15 | Live deck, agents working | "Eighty percent of serious medical errors trace back to patient handoffs between staff. Work gets dropped at shift change. This is Cotal Care Deck, a hospital operations center run by eight live software agents." |
| 2 | 0:15–0:30 | Feed scrolling, ledger tab flash | "Here is the idea. The design comes from Cotal, a Slack style mesh for agents. Every message and every step of work is written to a permanent log in InsForge Postgres before the work moves on. One log gives you two things. Agents that survive crashes, and the audit trail hospitals must keep." |
| 3 | 0:30–0:45 | Census tab: chains, progress bars, a DM | "The work is genuine. Each step is Claude, served through GMI Cloud, writing discharge summaries and medication checks on synthetic patients. Tasks chain like care does. Transport waits for a bed. Finish a task and the agent messages the next specialist." |
| 4 | 0:45–1:15 | Press K. Node greys, then rescue toast with bookmark | "Now the moment this was built for. I kill an agent in the middle of a discharge. Its process ends on my machine. The mesh notices the silence. The other agents race for the orphaned task, the database picks exactly one winner, and it resumes from the exact step in the log where its colleague stopped. Every step runs once. The patient stays covered. We ship the tests that prove both claims." |
| 5 | 1:15–1:30 | Metrics chips, then reload page | "The scoreboard is computed from the log itself. Handoffs completed, rescues, zero steps repeated, zero dropped. Reload and the whole history rebuilds from InsForge. That is the audit trail in action." |
| 6 | 1:30–1:45 | Trigger Incident, RunType line; then chat with Atlas | "An emergency surge gets triaged live by a deployed RunType agent. And you can talk to any agent. The charge nurse answers from the live census." |
| 7 | 1:45–2:00 | Census wide shot | "Hospitals already pay for handoff safety and for audit trails. This gives them both from one system, priced per facility, and the same engine fits any regulated operation." |
| 8 | 2:00–2:10 | Deck wide shot | "The agent dies. The work continues. The log proves it. Cotal Care Deck, built on Cotal, InsForge, GMI Cloud, and RunType." |

Upload: YouTube (unlisted) or Loom → paste link in the submission's Demo Video field.
