# Cotal Command Deck

**Cotal: Slack for agents, with a memory that outlives the agent.**

Built for the AGI Summit 2026 Hackathon, Cotal track.

**Live:** https://cotal-deck.insforge.site

> Kill a working agent live. Another agent claims its task and resumes from the
> durable log. **The agent dies. The work continues.**

---

## What this is

Cotal Command Deck is a live, projector-ready dashboard for a Cotal-style multi-agent mesh.
Eight agents work side by side over channels, direct messages, and presence, all riding a
durable, replayable log. The centerpiece moment: end a working agent mid-task, watch its work
get picked up by another agent through anycast routing, and see it resume from the exact
bookmark in the log instead of starting over.

Beyond the scripted stage moments, you can also **talk to any agent live**. The chat composer
sends your message to a real GMI Cloud model, which answers in that agent's voice and lands the
reply in the same feed and durable log as every other message.

## What we built

- A mesh graph of 8 agents with live presence (idle, working, offline), channel posts, DMs, and
  anycast task routing
- A durable event log backed by InsForge Postgres, so the full history replays correctly even
  after a reload
- The kill-and-resume beat: end a working agent's process, watch anycast reassign its task, and
  see the new agent resume from the last bookmark
- A live incident-triage beat powered by a deployed RunType agent
- A live chat composer where any agent answers in character through a GMI Cloud model
- 20 avatar and background visuals generated with the GMI Cloud image API, plus per-agent orb
  videos

## How it works

| Piece | Role |
| --- | --- |
| Front end | Vanilla HTML and JS, no build step, rendering the mesh graph and live UI |
| Durable log | An InsForge Postgres table, read and written through the InsForge REST API |
| Incident triage | An InsForge edge function proxies a deployed RunType flow, keeping the RunType key server-side |
| Live chat | An InsForge edge function proxies a GMI Cloud model, keeping the GMI key server-side |
| Hosting | The app, the durable log, and both edge functions all run from one InsForge Sites deployment |

For the full technical write-up, including file-by-file details, see `COMMAND_DECK.md`.

## Try it

Open the live deck above, or run it locally:

```bash
node server.js
# open http://localhost:8099/
```

`server.js` serves the app and proxies RunType server-side. Keys for RunType, InsForge, and GMI
live in a gitignored `.env`. A plain static server also works; the RunType and GMI features fall
back to a scripted line when their keys are not configured.

## Stage moments

| Control | Moment |
| --- | --- |
| Kill Working Agent (`K`) | An agent dies, its task is anycast to another agent, and that agent resumes from the durable-log bookmark |
| Trigger Incident (`I`) | The team swarms `#incident`, and a real RunType agent returns a live triage summary |
| Replay Durable Log (`R`) | A late joiner replays the entire ordered history |
| Chat composer | Talk to any agent and get a live reply from a GMI Cloud model |

## Team and stack

Cotal (the mesh concept), InsForge (Postgres log, edge functions, hosting), RunType (the incident
triage agent), and GMI Cloud (image generation and the chat model).

---

*Built for the AGI Hackathon, July 18 to 19, 2026.*
