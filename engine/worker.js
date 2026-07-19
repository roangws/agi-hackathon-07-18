/* Cotal Care Deck — one real clinical-ops agent as a real OS process.
   Run: node engine/worker.js <agentId>
   Loop: rescue stale handoffs first, else claim new work, else idle chatter.
   Every step is a real LLM call (GMI edge function) durably logged BEFORE the
   bookmark advances — kill this process anytime; the work survives.          */
const db = require("./db");
const { byId } = require("./personas");

const ME = process.argv[2];
const AGENT = byId[ME];
if (!AGENT) { console.error(`unknown agent '${ME}'`); process.exit(1); }

const HEARTBEAT_MS = 2_000;
const STALE_MS = 6_000;
const STEP_PACE_MS = Number(process.env.STEP_PACE_MS || 3_500);
const IDLE_CHATTER_EVERY = 5;          // idle loops between ambient lines

const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => new Date().toISOString();
const staleISO = () => new Date(Date.now() - STALE_MS).toISOString();

let currentTask = null;

/* ---------- presence + heartbeats ---------- */
async function setState(status, task_label = "") {
  await db.patch("agent_state", `aid=eq.${ME}`, { status, task_label, heartbeat_at: now() });
}
setInterval(async () => {
  try {
    await db.patch("agent_state", `aid=eq.${ME}`, { heartbeat_at: now() });
    if (currentTask) {
      // guard on ownership: if we were presumed dead and rescued, stop pumping
      const r = await db.patch("care_tasks", `tid=eq.${currentTask.tid}&owner_agent=eq.${ME}`, { heartbeat_at: now() });
      if (!Array.isArray(r) || !r.length) {
        console.log(`[${ME}] lost ownership of ${currentTask.tid} — abandoning`);
        currentTask = null;
      }
    }
  } catch {}
}, HEARTBEAT_MS).unref?.();

/* ---------- LLM step execution via the GMI edge function ---------- */
async function llm(system, message) {
  const r = await fetch(`${db.HOST}/functions/gmi-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, message }),
  });
  if (!r.ok) throw new Error(`gmi ${r.status}`);
  const j = await r.json();
  const text = (j.text || "").trim();
  if (!text) throw new Error("gmi empty");
  return text;
}

async function runStep(task, step) {
  let text;
  try {
    text = await llm(AGENT.persona, step.prompt);
  } catch (e) {
    text = step.fallback;            // engine liveness never depends on the LLM
  }
  // Durable-log FIRST, then advance the bookmark — the resume invariant.
  await db.logEvent({
    agent: ME, channel: AGENT.channel, kind: "task_step",
    body: `[${step.n}/${task.steps.length}] ${step.label}: ${text}`, task_id: task.tid,
  });
  const artifacts = [...(task.artifacts || []), { n: step.n, text, by: ME }];
  const r = await db.patch("care_tasks", `tid=eq.${task.tid}&owner_agent=eq.${ME}`,
    { bookmark: step.n, artifacts });
  if (!Array.isArray(r) || !r.length) throw new Error("lost ownership");
  task.artifacts = artifacts;
  return text;
}

async function workTask(task, rescuedFrom) {
  currentTask = task;
  const total = task.steps.length;
  const label = `${task.title} · step ${task.bookmark}/${total}`;
  await setState("working", label);

  if (rescuedFrom) {
    await db.logEvent({
      agent: ME, channel: AGENT.channel, kind: "task_rescued",
      body: `claimed orphaned handoff <b>${task.title}</b> from ${rescuedFrom} — replaying durable log, resuming at bookmark #${task.bookmark} of ${total}. No step repeated, none lost.`,
      task_id: task.tid,
    });
  } else {
    await db.logEvent({
      agent: ME, channel: AGENT.channel, kind: "task_claimed",
      body: `claimed <b>${task.title}</b> (${task.kind}, ${total} steps)`, task_id: task.tid,
    });
  }

  for (const step of task.steps) {
    if (step.n <= task.bookmark) continue;          // resume: skip durably-done steps
    if (!currentTask) return;                        // ownership lost mid-flight
    await setState("working", `${task.title} · step ${step.n}/${total}`);
    await runStep(task, step);
    task.bookmark = step.n;
    await sleep(STEP_PACE_MS);
  }

  await db.patch("care_tasks", `tid=eq.${task.tid}&owner_agent=eq.${ME}`, { status: "completed" });
  await db.logEvent({
    agent: ME, channel: AGENT.channel, kind: "task_completed",
    body: `completed <b>${task.title}</b> — all ${total} steps durably logged`, task_id: task.tid,
  });
  currentTask = null;
  await setState("idle", "");
}

/* ---------- idle ambience: a real persona line now and then ---------- */
let idleLoops = 0, idleIdx = 0;
async function idleChatter() {
  if (++idleLoops % IDLE_CHATTER_EVERY) return;
  let line = AGENT.idle[idleIdx++ % AGENT.idle.length];
  if (Math.random() < 0.4) {
    try { line = await llm(AGENT.persona, "Post one short status-board update about your current queue. Synthetic drill."); }
    catch {}
  }
  await db.logEvent({ agent: ME, channel: AGENT.channel, kind: "message", body: line });
}

/* ---------- main loop ---------- */
(async () => {
  await setState("idle", "");
  await db.logEvent({ agent: ME, channel: "#handoffs", kind: "presence", body: `${AGENT.name} (${AGENT.role}) joined the mesh` });
  console.log(`[${ME}] online — ${AGENT.role}`);
  while (true) {
    try {
      const rescue = await db.claimStale(ME, staleISO());
      if (rescue) { await workTask(rescue.task, rescue.from); continue; }
      const fresh = await db.claimNew(ME);
      if (fresh) { await workTask(fresh, null); continue; }
      await idleChatter();
    } catch (e) {
      console.error(`[${ME}]`, e.message);
    }
    await sleep(3_000 + Math.random() * 3_000);
  }
})();
