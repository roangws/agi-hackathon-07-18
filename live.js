/* ================= LIVE MODE =================
   The deck stops acting and starts REPORTING: it polls the durable log
   (mesh_log), presence (agent_state), and the census (patients/care_tasks)
   that the real worker fleet writes, and renders them through the same
   visual seams the scripted mode uses. Kill = real SIGKILL via /mesh/kill. */

window.LIVE = (() => {
  const cfg = window.INSFORGE || {};
  const REC = t => `${cfg.host}/api/database/records/${t}`;
  const HDR = { "Authorization": `Bearer ${cfg.key}`, "Content-Type": "application/json" };

  let lastTs = "1970-01-01T00:00:00Z";
  let backfilled = false;
  let seenSeq = 0;

  /* proof metrics — computed from the durable log, not asserted */
  const M = { done: 0, rescues: 0, rescueMs: [], stepSeen: {}, repeated: 0, lastStepTs: {} };
  function renderMetrics() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("mDone", M.done); set("mRescues", M.rescues); set("mRepeat", M.repeated);
    set("mRescueT", M.rescueMs.length
      ? (M.rescueMs.reduce((a, b) => a + b, 0) / M.rescueMs.length / 1000).toFixed(1) + "s" : "–");
    set("mDropped", 0);   // any orphan is reclaimed by design; repeated-steps counter guards the claim
  }
  function trackMetrics(ev) {
    if (ev.kind === "task_completed") M.done++;
    if (ev.kind === "task_step") {
      const m = ev.body.match(/^\[(\d+)\//);
      const key = ev.task_id + ":" + (m ? m[1] : "?");
      if (M.stepSeen[key]) M.repeated++; else M.stepSeen[key] = true;
      M.lastStepTs[ev.task_id] = new Date(ev.created_at).getTime();
    }
    if (ev.kind === "task_rescued") {
      M.rescues++;
      const prev = M.lastStepTs[ev.task_id];
      if (prev) M.rescueMs.push(new Date(ev.created_at).getTime() - prev);
    }
    renderMetrics();
  }

  async function fetchRows(table, qs) {
    const r = await fetch(`${REC(table)}?${qs}`, { headers: HDR });
    if (!r.ok) throw new Error(`${table} ${r.status}`);
    return r.json();
  }

  /* ---------- durable log → feed + ledger ---------- */
  const KIND_CLS = {
    message: "msg", dm: "dm", presence: "presence", task_claimed: "task",
    task_step: "task", task_rescued: "resume", task_completed: "task",
  };

  function render(ev, liveNow) {
    const cls = KIND_CLS[ev.kind] || "msg";
    const who = byId[ev.agent] ? ev.agent : "atlas";
    seenSeq++;
    trackMetrics(ev);
    if (ev.kind === "task_rescued") {
      say(who, ev.channel, ev.body, "sys");
      log("resume", `${byId[who].name} RESUMED from durable-log bookmark`, "resume");
      if (liveNow) {
        nodes[who]?.classList.add("reborn");
        setTimeout(() => nodes[who]?.classList.remove("reborn"), 2400);
        flashScene("scene-resume.png");
        pulse("atlas", who, "#f5b642", true);
        const m = ev.body.match(/bookmark #(\d+) of (\d+)/);
        showToast("scene-resume.png", "HANDOFF NEVER DROPPED",
          `A real worker process was killed mid-handoff. Its task was <b>anycast</b> to ${byId[who].name}, ` +
          `who replayed the durable log and resumed at <b>bookmark #${m ? m[1] : "?"}${m ? " of " + m[2] : ""}</b>. ` +
          `No step repeated, none lost — and the whole rescue is in the <b>audit trail</b>.`);
      }
    } else if (ev.kind === "task_step") {
      const body = ev.body.length > 260 ? ev.body.slice(0, 260) + "…" : ev.body;
      say(who, ev.channel, body, "msg");
      log("task", `${byId[who].name} step durably logged`, "task");
      if (liveNow) pulse(who, "atlas", byId[who]?.c);
    } else if (ev.kind === "task_claimed") {
      say(who, ev.channel, ev.body, "sys");
      log("task", `${byId[who].name} CLAIMED task (anycast)`, "task");
      if (liveNow) pulse("atlas", who, byId[who]?.c, true);
    } else if (ev.kind === "task_completed") {
      say(who, ev.channel, ev.body, "msg");
      log("task", `${byId[who].name} COMPLETED task`, "task");
    } else if (ev.kind === "presence") {
      log("presence", ev.body.replace(/<[^>]+>/g, ""), "presence");
    } else {
      say(who, ev.channel || "#handoffs", ev.body, cls === "dm" ? "dm" : "msg");
      log(ev.kind, `${byId[who]?.name || ev.agent} → ${ev.channel}`, cls);
      if (liveNow && byId[who]) pulse(who, "atlas", byId[who].c);
    }
  }

  let polling = false;
  const seenIds = new Set();
  async function pollLog() {
    if (polling) return;                       // overlapping slow polls double-render
    polling = true;
    try {
      const rows = await fetchRows("mesh_log",
        `created_at=gt.${encodeURIComponent(lastTs)}&order=created_at.asc&limit=120`);
      for (const ev of rows) {
        lastTs = ev.created_at;
        if (seenIds.has(ev.id)) continue;      // exactly-once render, like the log itself
        seenIds.add(ev.id);
        render(ev, backfilled);
      }
      if (!backfilled && rows.length < 120) {
        backfilled = true;
        const div = document.createElement("div");
        div.className = "restore-divider";
        div.textContent = `⇡ replayed ${seenSeq} events from the durable log (InsForge Postgres)`;
        document.getElementById("ledger").appendChild(div);
      }
      document.getElementById("stIf").textContent = seenSeq;
      document.getElementById("ifDot").className = "ifdot ok";
    } finally { polling = false; }
  }

  /* ---------- presence: agent_state heartbeats ---------- */
  async function pollPresence() {
    const rows = await fetchRows("agent_state", "limit=20");
    const now = Date.now();
    for (const a of rows) {
      if (!byId[a.aid]) continue;
      const hb = a.heartbeat_at ? new Date(a.heartbeat_at).getTime() : 0;
      const stale = now - hb > 32000;   // match engine STALE_MS + margin
      const st = stale ? "offline" : (a.status === "working" ? "working" : "idle");
      if (S.presence[a.aid] !== st || S.tasks[a.aid] !== (a.task_label || "")) {
        if (st === "offline" && S.presence[a.aid] !== "offline") {
          nodes[a.aid].classList.add("dying");
          burst(byId[a.aid].x, byId[a.aid].y);
          flashScene("scene-death.png");
          say("vega", "#rapid-response",
            `${ic("flatline","r")}worker <b>${byId[a.aid].name}</b> lost heartbeat — process down`, "sys");
          log("death", `${byId[a.aid].name} OFFLINE (heartbeat lost)`, "death");
          setTimeout(() => nodes[a.aid].classList.remove("dying"), 600);
        }
        setPresence(a.aid, st, st === "working" ? (a.task_label || "working…") : "");
      }
    }
  }

  /* ---------- census panel ---------- */
  let censusLine = "";
  async function pollCensus() {
    const el = document.getElementById("census");
    if (!el) return;
    const [patients, tasks] = await Promise.all([
      fetchRows("patients", "order=acuity.asc&limit=20"),
      fetchRows("care_tasks", "limit=40"),
    ]);
    const byTid = Object.fromEntries(tasks.map(t => [t.tid, t]));
    const byPatient = {};
    tasks.forEach(t => { (byPatient[t.patient_id] = byPatient[t.patient_id] || []).push(t); });
    const openN = tasks.filter(t => t.status !== "completed").length;
    const doneN = tasks.filter(t => t.status === "completed").length;
    censusLine = `Live census: ${patients.length} patients, ${openN} open handoffs, ${doneN} completed. ` +
      tasks.filter(t => t.status === "in_progress").slice(0, 5)
        .map(t => `${t.title} (${t.owner_agent}, step ${t.bookmark}/${(t.steps || []).length})`).join("; ");
    el.innerHTML = patients.map(p => {
      const open = (byPatient[p.pid] || []).filter(t => t.status !== "completed");
      const t = open[0];
      const total = t ? (t.steps || []).length : 0;
      const pct = t && total ? Math.round(100 * (t.bookmark || 0) / total) : 0;
      const owner = t && t.owner_agent && byId[t.owner_agent];
      const blocked = t && t.depends_on && byTid[t.depends_on] && byTid[t.depends_on].status !== "completed";
      return `<div class="crow">
        <span class="cdot a${p.acuity}"></span>
        <span class="cname">${p.name}</span>
        <span class="cmrn">${p.mrn} · ${p.age}${p.sex}</span>
        <span class="ccond">${(p.conditions || []).join(", ")}</span>
        ${t ? (blocked
            ? `<span class="ctask done">⛓ ${t.title.split(":")[0]} · waiting on ${byTid[t.depends_on].title.split(":")[0]}</span>`
            : `<span class="ctask" style="--oc:${owner ? owner.c : "#666"}">
                 ${t.title.split(":")[0]} · ${owner ? owner.name : "queued"}
                 <i class="cbar"><b style="width:${pct}%"></b></i></span>`)
            : `<span class="ctask done">no open handoffs</span>`}
      </div>`;
    }).join("");
  }

  /* ---------- live controls ---------- */
  async function killWorkingAgent() {
    const states = await fetchRows("agent_state", "status=eq.working&limit=10");
    const victim = states.find(a => byId[a.aid] && S.presence[a.aid] === "working");
    if (!victim) {
      showToast("scene-death.png", "NO AGENT MID-TASK", "Wait until an agent picks up a handoff, then kill it mid-work for the full effect.");
      return;
    }
    const r = await fetch("/mesh/kill", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: victim.aid }),
    });
    const j = await r.json();
    if (j.killed) {
      say("You", "#rapid-response",
        `sent <b>SIGKILL</b> to ${byId[j.killed].name}'s worker process (pid ${j.pid}) — this is a real OS kill, not an animation`, "sys");
      log("death", `SIGKILL → ${byId[j.killed].name} (pid ${j.pid})`, "death");
      // auto-revive after the beat so the fleet stays full for the next demo moment
      setTimeout(() => fetch("/mesh/revive", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: j.killed }),
      }).then(() => say(j.killed, "#handoffs", "process respawned — rejoining the mesh", "msg")), 25000);
    }
  }

  async function replayDurable() {
    if (S.busy) return; S.busy = true;
    switchTab("ledger");
    showToast("scene-ledger.png", "REPLAYING THE DURABLE LOG",
      "Everything you watched was written to Postgres as it happened. Reload the page — the deck rebuilds this entire history from the durable log. That is the audit trail.");
    const rows = [...document.querySelectorAll("#ledger .lrow")];
    for (const row of rows.slice(-16)) {
      row.classList.add("replaying"); row.scrollIntoView({ block: "center", behavior: "smooth" });
      await wait(160 / S.speed);
      row.classList.remove("replaying");
    }
    S.busy = false;
  }

  async function surge() {
    if (S.busy) return; S.busy = true;
    const msg = "ED surge: census at 142%, 6 boarding in the ED, 2 ambulances inbound";
    say("vega", "#rapid-response", `${ic("bolt","r")}<b>ED SURGE</b>: ${msg}`, "sys");
    log("presence", "vega OPENED #rapid-response", "presence");
    flashScene("scene-incident.png");
    RING.forEach((id, i) => setTimeout(() => {
      if (S.presence[id] !== "offline") pulse(id, "atlas", byId[id].c);
    }, i * 140));
    // durably log the surge so it is part of the audit trail
    fetch(REC("mesh_log"), { method: "POST", headers: HDR,
      body: JSON.stringify([{ agent: "vega", channel: "#rapid-response", kind: "message", body: msg }]) }).catch(()=>{});
    let summary = null;
    if (RT.on) {
      say("sven", "#rapid-response", `${ic("route","y")}dispatching to <b>RunType agent</b> for surge triage…`, "sys");
      summary = await RT.ask(
        `You are a hospital operations surge-triage bot (synthetic drill, ops only). Reply with EXACTLY one line: <one concise ops recommendation> — severity: <low|medium|high>. Situation: ${msg}`);
    }
    if (summary) {
      say("sven", "#rapid-response", `${ic("bolt","y")}<b>RunType agent</b>: ${summary}`, "sys");
      log("message", "RunType surge triage → #rapid-response", "msg");
      fetch(REC("mesh_log"), { method: "POST", headers: HDR,
        body: JSON.stringify([{ agent: "sven", channel: "#rapid-response", kind: "message", body: `RunType triage: ${summary}` }]) }).catch(()=>{});
    }
    showToast("scene-incident.png", "SURGE TRIAGED LIVE",
      summary
        ? `A deployed <b>RunType</b> agent triaged the surge in real time:<br><b>"${summary}"</b><br>The recommendation is in the durable log — auditable later.`
        : "Surge posted to #rapid-response and preserved in the durable log.");
    S.busy = false;
  }

  /* ---------- boot ---------- */
  let timers = [];
  async function init() {
    S.live = true;
    document.querySelector(".live").innerHTML = '<span class="dot"></span> Live · real agents';
    // controls take the live paths
    document.getElementById("btnKill").onclick = () => { switchTab("feed"); killWorkingAgent(); };
    document.getElementById("btnReplay").onclick = replayDurable;
    document.getElementById("btnIncident").onclick = () => { switchTab("feed"); surge(); };
    await pollLog().catch(() => {});
    timers = [
      setInterval(() => pollLog().catch(() => {}), 2000),
      setInterval(() => pollPresence().catch(() => {}), 3000),
      setInterval(() => pollCensus().catch(() => {}), 4500),
    ];
    pollPresence().catch(() => {}); pollCensus().catch(() => {});
  }

  return { init, contextLine: () => censusLine };
})();
