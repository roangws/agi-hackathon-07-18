# Cotal Command Deck: the visual

A cinematic, projector-ready **visualization** of a Cotal-style multi-agent mesh, built to be
the "walk past the table and go *wow*" centerpiece for the Cotal.ai track at the AGI Summit
2026 Hackathon.

**Live:** https://cotal-deck.insforge.site

> **What this is:** a self-contained web dashboard that *dramatizes* the Cotal concept:
> channels, DMs, presence, anycast, and a durable replayable log, with the **"agent survives
> death"** beat as the climax. You can also **talk to any agent live** through the chat
> composer, with real replies from a GMI Cloud model, streamed into the same feed and durable
> log. All 20 avatar visuals were generated with the **GMI Cloud image API**.
>
> **Scripted core, live chat layer:** the mesh chatter, kill/resume, and incident beats are a
> scripted visualization so they always work on the projector, while the chat composer calls a
> real GMI Cloud model for genuine live replies. See "Connect the real mesh" below for wiring
> live `cotal-ai` events into the scripted beats too. The real-CLI runbook lives in `README.md`.

## Run it (zero dependencies)

```bash
node server.js
# open http://localhost:8099/  → press F11 / ⌃⌘F for full screen
```

`server.js` serves the deck and proxies the RunType call server-side (keeps the API
key off the client and adds the CORS the browser needs). It reads `RUNTYPE_*` and the
InsForge/GMI keys from `.env` (gitignored). A plain `python3 -m http.server 8099` still
works too: the RunType badge just shows `off` and the incident beat uses a scripted line.

## Stage controls

| Button / Key | Moment |
|---|---|
| **⏸ Pause** / `Space` | pause the ambient agent chatter |
| **💀 Kill Working Agent** / `K` | **the money shot**: an agent dies, task is anycast to another, resumes from durable-log bookmark, "AGENT SURVIVED DEATH" |
| **⚠ Trigger Incident** / `I` | the whole team swarms `#incident` and fixes it live |
| **⟲ Replay Durable Log** / `R` | a late-joiner replays the entire ordered history |
| Speed slider | 0.5×–3× |

Auto/kiosk: add `?auto=kill` (or `incident` / `replay` / `chat`) to fire a beat hands-free after load.

## Live agent chat

The composer under the Channels rail lets you talk to any of the eight agents directly. Pick an
agent, type a message, and a real GMI Cloud model answers in that agent's voice, then lands in
the feed and the durable log like any other message.

- Backed by `functions/gmi-chat.ts`, an InsForge edge function that keeps the GMI key on the
  server and adds the CORS headers the browser needs.
- The model is Claude Haiku 4.5, served through the GMI Cloud inference API.
- Each agent has its own persona prompt (see `PERSONAS` in `app.js`), so Atlas, David, Nova,
  Sven, Echo, Vega, Iris, and Zephyr each answer in character.
- When the GMI key is not configured, the agent responds with a short built-in line instead, so
  the composer stays usable either way.
- The stage view is labeled **Mesh Graph** with a legend explaining the presence dots and link
  lines, and the "Powered by" strip in the footer now includes **GMI** alongside Cotal, InsForge,
  and RunType.

## 90-second stage script

1. Open full-screen. Let the mesh breathe for ~5s: agents chatting, presence pulsing. *"This
   is Cotal, Slack for your agents. Eight agents, one mesh: channels, DMs, presence, all on a
   durable log."*
2. Hit **💀 Kill Working Agent**. *"David's working on a task, and I just killed his process."*
   Point at the node greying out and agents-online ticking down.
3. As Nova lights up: *"Because every message rides a durable JetStream log, the task was
   anycast to Nova, who replayed from the exact bookmark and finished it. **The agent died,
   the work continued.**"*
4. Hit **⟲ Replay Durable Log**. *"And the whole history is replayable: a late-joiner catches
   up on everything. That's what makes a multi-agent system resilient."*

## Connect the real mesh (optional)

The Cotal prize rewards genuine use of the real protocol. Two ways to get there fast:
- **Run the real mesh alongside** using `README.md`'s runbook (`npx cotal-ai setup --demo` then
  `cotal web`) and present this deck as the polished "control room" view of it.
- **Feed real events in:** `app.js` centralizes all state changes in `say()`, `log()`,
  `setPresence()`, and `pulse()`. Swap the scripted `chatter()` and `killAndResume()` triggers
  for a WebSocket subscription to a live Cotal channel and presence stream, and the same visuals
  will render real mesh traffic.

## Files
- `index.html`: layout and styling
- `app.js`: mesh engine, live chat wiring, and the `PERSONAS` used by GMI chat
- `functions/gmi-chat.ts`: InsForge edge function proxying the GMI Cloud model for live chat
- `functions/rt-triage.ts`: InsForge edge function proxying RunType for the incident beat
- `assets/img/`: 20 GMI Cloud image API PNGs, plus per-agent orb videos in `assets/orbs/`
- `gen_images.py`: regenerate image assets from GMI Cloud (reads `.env`)
