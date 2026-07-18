# Cotal Command Deck — the visual

A cinematic, projector-ready **visualization** of a Cotal-style multi-agent mesh, built to be
the "walk past the table and go *wow*" centerpiece for the Cotal.ai track at the AGI Summit
2026 Hackathon.

> **What this is:** a self-contained web dashboard that *dramatizes* the Cotal concept —
> channels, DMs, presence, anycast, and a durable replayable log — with the **"agent survives
> death"** beat as the climax. All 20 visuals were generated with the **GMI Cloud image API**.
>
> **What this is not (yet):** it is not wired to a live `cotal-ai` mesh — it's a scripted
> visualization so it *always works* on the projector. See "Make it prize-legit" below to
> connect the real mesh. The real-CLI runbook lives in `README.md`.

## Run it (zero dependencies)

```bash
node server.js
# open http://localhost:8099/  → press F11 / ⌃⌘F for full screen
```

`server.js` serves the deck and proxies the RunType call server-side (keeps the API
key off the client and adds the CORS the browser needs). It reads `RUNTYPE_*` and the
InsForge/GMI keys from `.env` (gitignored). A plain `python3 -m http.server 8099` still
works too — the RunType badge just shows `off` and the incident beat uses a scripted line.

## Stage controls

| Button / Key | Moment |
|---|---|
| **⏸ Pause** / `Space` | pause the ambient agent chatter |
| **💀 Kill Working Agent** / `K` | **the money shot** — an agent dies, task is anycast to another, resumes from durable-log bookmark, "AGENT SURVIVED DEATH" |
| **⚠ Trigger Incident** / `I` | the whole team swarms `#incident` and fixes it live |
| **⟲ Replay Durable Log** / `R` | a late-joiner replays the entire ordered history |
| Speed slider | 0.5×–3× |

Auto/kiosk: add `?auto=kill` (or `incident` / `replay`) to fire a beat hands-free after load.

## 90-second stage script

1. Open full-screen. Let the mesh breathe for ~5s — agents chatting, presence pulsing. *"This
   is Cotal — Slack for your agents. Eight agents, one mesh: channels, DMs, presence, all on a
   durable log."*
2. Hit **💀 Kill Working Agent**. *"David's working on a task… and I just killed his process."*
   Point at the node greying out and agents-online ticking down.
3. As Nova lights up: *"Because every message rides a durable JetStream log, the task was
   anycast to Nova — who replayed from the exact bookmark and finished it. **The agent died;
   the work didn't.**"*
4. Hit **⟲ Replay Durable Log**. *"And the whole history is replayable — a late-joiner catches
   up on everything. That's what makes a multi-agent system crash-proof."*

## Make it prize-legit (optional, connects the real mesh)

The Cotal prize rewards genuine use of the real protocol. Two ways to get there fast:
- **Run the real mesh alongside** using `README.md`'s runbook (`npx cotal-ai setup --demo` →
  `cotal web`) and present this deck as the polished "control room" view of it.
- **Feed real events in:** `app.js` centralizes all state changes in `say()`, `log()`,
  `setPresence()`, and `pulse()`. Replace the scripted `chatter()`/`killAndResume()` triggers
  with a WebSocket/subscription to a live Cotal channel + presence stream and the same visuals
  render real mesh traffic.

## Files
- `index.html` — layout + styling · `app.js` — mesh engine · `assets/img/` — 20 GMI PNGs
- `gen_images.py` — regenerate assets from GMI Cloud (reads `.env`)
