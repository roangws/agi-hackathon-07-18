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
      say(who, ev.channel, ev.body, "msg");
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

  async function pollLog() {
    const rows = await fetchRows("mesh_log",
      `created_at=gt.${encodeURIComponent(lastTs)}&order=created_at.asc&limit=120`);
    for (const ev of rows) {
      render(ev, backfilled);
      lastTs = ev.created_at;
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
  }

  /* ---------- presence: agent_state heartbeats ---------- */
  async function pollPresence() {
    const rows = await fetchRows("agent_state", "limit=20");
    const now = Date.now();
    for (const a of rows) {
      if (!byId[a.aid]) continue;
      const hb = a.heartbeat_at ? new Date(a.heartbeat_at).getTime() : 0;
      const stale = now - hb > 6500;
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
  async function pollCensus() {
    const el = document.getElementById("census");
    if (!el) return;
    const [patients, tasks] = await Promise.all([
      fetchRows("patients", "order=acuity.asc&limit=20"),
      fetchRows("care_tasks", "limit=40"),
    ]);
    const byPatient = {};
    tasks.forEach(t => { (byPatient[t.patient_id] = byPatient[t.patient_id] || []).push(t); });
    el.innerHTML = patients.map(p => {
      const open = (byPatient[p.pid] || []).filter(t => t.status !== "completed");
      const t = open[0];
      const total = t ? (t.steps || []).length : 0;
      const pct = t && total ? Math.round(100 * (t.bookmark || 0) / total) : 0;
      const owner = t && t.owner_agent && byId[t.owner_agent];
      return `<div class="crow">
        <span class="cdot a${p.acuity}"></span>
        <span class="cname">${p.name}</span>
        <span class="cmrn">${p.mrn} · ${p.age}${p.sex}</span>
        <span class="ccond">${(p.conditions || []).join(", ")}</span>
        ${t ? `<span class="ctask" style="--oc:${owner ? owner.c : "#666"}">
                 ${t.title.split(":")[0]} · ${owner ? owner.name : "queued"}
                 <i class="cbar"><b style="width:${pct}%"></b></i></span>`
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
      setInterval(() => pollLog().catch(() => {}), 1000),
      setInterval(() => pollPresence().catch(() => {}), 1500),
      setInterval(() => pollCensus().catch(() => {}), 2500),
    ];
    pollPresence().catch(() => {}); pollCensus().catch(() => {});
  }

  return { init };
})();
