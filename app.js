/* ================= COTAL COMMAND DECK =================
   A cinematic visualization of a Cotal-style multi-agent mesh:
   channels · DMs · presence · anycast · durable replayable log,
   culminating in the "agent survives death" beat.
   Pure vanilla JS. Self-driving simulation with live controls.        */

const IMG = "assets/img/";
const ORB = "assets/orbs/";
document.getElementById("emblem").src = ORB + "orb-atlas.png";

/* ================= InsForge: durable log persistence =================
   Every ledger event is written to a real InsForge Postgres table
   (auto-generated REST API). On boot we replay prior events back from
   the cloud — so the "durable replayable log" survives a full reload.  */
const IF = (() => {
  const cfg = window.INSFORGE;
  const on = !!(cfg && cfg.host && cfg.key);
  const url = on ? `${cfg.host}/api/database/records/${cfg.table||"mesh_events"}` : null;
  const hdr = on ? {"Authorization":`Bearer ${cfg.key}`,"Content-Type":"application/json"} : {};
  let queue=[], persisted=0, failed=false;
  function badge(){
    const dot=document.getElementById("ifDot"), n=document.getElementById("stIf");
    if(!on){ n.textContent="off"; dot.className="ifdot"; return; }
    n.textContent=persisted;
    dot.className="ifdot "+(failed?"err":"ok");
  }
  async function flush(){
    if(!on||!queue.length) return;
    const batch=queue.splice(0,queue.length);
    try{
      const r=await fetch(url,{method:"POST",headers:hdr,body:JSON.stringify(batch)});
      if(!r.ok) throw new Error(r.status);
      persisted+=batch.length; failed=false;
    }catch(e){ failed=true; /* drop batch; demo continues */ }
    badge();
  }
  if(on) setInterval(flush, 1500);
  return {
    on,
    persist(row){ if(on && !S.live) queue.push({seq:row.seq,kind:row.cls,actor:row.ev,channel:"",detail:row.detail}); },
    async loadHistory(){
      if(!on) { badge(); return []; }
      try{
        const r=await fetch(`${url}?order=seq.asc&limit=300`,{headers:hdr});
        if(!r.ok) throw new Error(r.status);
        const rows=await r.json(); persisted=rows.length; badge(); return rows;
      }catch(e){ failed=true; badge(); return []; }
    },
    count(){ return persisted; }
  };
})();

/* ---------- clinical ops agents (synthetic drill — ops assist, not medical advice) ---------- */
const AGENTS = [
  {id:"atlas",  name:"Atlas",  role:"Charge Nurse",  c:"#f5b642", center:true},
  {id:"david",  name:"David",  role:"Discharge",     c:"#3b82f6"},
  {id:"nova",   name:"Nova",   role:"Pharmacy",      c:"#22c55e"},
  {id:"sven",   name:"Sven",   role:"Bed Flow",      c:"#8b5cf6"},
  {id:"echo",   name:"Echo",   role:"Labs",          c:"#06b6d4"},
  {id:"vega",   name:"Vega",   role:"Imaging",       c:"#f97316"},
  {id:"iris",   name:"Iris",   role:"Triage",        c:"#ec4899"},
  {id:"zephyr", name:"Zephyr", role:"Transport",     c:"#14b8a6"},
];
const byId = Object.fromEntries(AGENTS.map(a=>[a.id,a]));

/* who is linked to whom (drawn as mesh edges). Everyone links to Atlas + a peer ring. */
const RING = ["david","nova","sven","echo","vega","iris","zephyr"];

/* ---------- state ---------- */
const S = {
  playing:true, speed:1, t0:Date.now(),
  msgs:0, events:0, seq:0,
  pulses:[], particles:[], dying:new Set(), busy:false,
  live:false,  // true = deck reports the REAL worker fleet instead of the script
  presence:{}, // id -> 'working'|'idle'|'offline'
  tasks:{},    // id -> task label
};
AGENTS.forEach(a=>S.presence[a.id]="idle");

/* ---------- build agent DOM nodes ---------- */
const stage = document.getElementById("stage");
const nodes = {};
AGENTS.forEach(a=>{
  const el = document.createElement("div");
  el.className = "node idle";
  el.style.setProperty("--c", a.c);
  el.dataset.id = a.id;
  el.innerHTML = `
    <div class="orb-wrap">
      <video class="orb" autoplay loop muted playsinline poster="${ORB}orb-${a.id}.png">
        <source src="${ORB}orb-${a.id}.mp4" type="video/mp4">
      </video>
    </div>
    <div class="name">${a.name}</div>
    <div class="role">${a.role}</div>
    <div class="pstat"><span class="pd"></span><span class="ptext">idle</span></div>
    <div class="task"></div>`;
  stage.appendChild(el);
  nodes[a.id] = el;
});

/* ---------- canvas mesh ---------- */
const canvas = document.getElementById("mesh");
const ctx = canvas.getContext("2d");
let W=0,H=0, DPR=Math.min(devicePixelRatio||1,2);

function layout(){
  const r = stage.getBoundingClientRect();
  W=r.width; H=r.height;
  canvas.width=W*DPR; canvas.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0);
  const cx=W/2, cy=H/2+10;
  const rx=Math.min(W*0.36, 520), ry=Math.min(H*0.34, 300);
  byId.atlas.x=cx; byId.atlas.y=cy;
  RING.forEach((id,i)=>{
    const ang = -Math.PI/2 + i*(2*Math.PI/RING.length);
    byId[id].x = cx + Math.cos(ang)*rx;
    byId[id].y = cy + Math.sin(ang)*ry;
  });
  AGENTS.forEach(a=>{
    nodes[a.id].style.left = a.x+"px";
    nodes[a.id].style.top  = a.y+"px";
  });
  // seed particles
  if(S.particles.length===0){
    for(let i=0;i<70;i++) S.particles.push({
      x:Math.random()*W, y:Math.random()*H, vx:(Math.random()-.5)*.15,
      vy:(Math.random()-.5)*.15, r:Math.random()*1.6+.4, a:Math.random()*.5+.1});
  }
}
window.addEventListener("resize", layout);

function edges(){
  const e=[];
  RING.forEach(id=> e.push(["atlas",id]));           // hub
  for(let i=0;i<RING.length;i++)                      // ring
    e.push([RING[i], RING[(i+1)%RING.length]]);
  return e;
}
const EDGES = edges();

function draw(){
  ctx.clearRect(0,0,W,H);
  // particles
  S.particles.forEach(p=>{
    p.x+=p.vx*S.speed; p.y+=p.vy*S.speed;
    if(p.x<0)p.x=W; if(p.x>W)p.x=0; if(p.y<0)p.y=H; if(p.y>H)p.y=0;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7); ctx.fillStyle=`rgba(255,255,255,${p.a*0.5})`; ctx.fill();
  });
  // edges
  EDGES.forEach(([a,b])=>{
    const A=byId[a],B=byId[b];
    const off = S.presence[a]==="offline"||S.presence[b]==="offline";
    ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y);
    ctx.strokeStyle = off ? "rgba(255,90,90,.06)" : "rgba(255,255,255,.07)";
    ctx.lineWidth = 1; ctx.stroke();
  });
  // travelling pulses (messages)
  S.pulses = S.pulses.filter(p=>{
    p.t += 0.018*S.speed*(p.fast?2:1);
    const A=byId[p.from], B=byId[p.to];
    const x=A.x+(B.x-A.x)*p.t, y=A.y+(B.y-A.y)*p.t;
    // trailing glow line
    ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(x,y);
    ctx.strokeStyle=p.c+"55"; ctx.lineWidth=2; ctx.stroke();
    ctx.beginPath(); ctx.arc(x,y,4.5,0,7);
    ctx.fillStyle=p.c; ctx.shadowColor=p.c; ctx.shadowBlur=16; ctx.fill(); ctx.shadowBlur=0;
    return p.t<1;
  });
  // death bursts
  S.bursts = (S.bursts||[]).filter(b=>{
    b.life-=0.02*S.speed;
    b.parts.forEach(pt=>{ pt.x+=pt.vx*S.speed; pt.y+=pt.vy*S.speed; pt.vy+=0.02;
      ctx.beginPath(); ctx.arc(pt.x,pt.y,pt.r,0,7);
      ctx.fillStyle=`rgba(255,${80+Math.random()*60|0},80,${Math.max(0,b.life)})`; ctx.fill(); });
    return b.life>0;
  });
  requestAnimationFrame(draw);
}

/* ---------- helpers ---------- */
function pulse(from,to,c,fast){ if(from&&to) S.pulses.push({from,to,t:0,c:c||"#7c8cff",fast}); }
function burst(x,y){
  const parts=[]; for(let i=0;i<40;i++){const a=Math.random()*7,s=Math.random()*4+1;
    parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,r:Math.random()*3+1});}
  (S.bursts=S.bursts||[]).push({parts,life:1});
}
function setPresence(id,st,task){
  S.presence[id]=st;
  const el=nodes[id]; el.className="node "+st;
  el.querySelector(".ptext").textContent = st==="working"?"working":st==="offline"?"terminated":"idle";
  if(task!==undefined){ S.tasks[id]=task; el.querySelector(".task").textContent=task||""; }
  updateStats();
}

/* ---------- proof-metric chips (live mode computes these from the durable log;
   scripted mode mirrors the same beats) ---------- */
function bumpMetric(id, v){ const el=document.getElementById(id); if(el) el.textContent = v!==undefined? v : (+el.textContent||0)+1; }

/* ---------- inline icon helper (no emojis) ---------- */
function ic(name,cls){ return `<svg class="mi ${cls||''}"><use href="#i-${name}"/></svg>`; }

/* ================= RunType: live agent capability =================
   The #incident beat calls a deployed RunType flow (hachathon_agent) via a
   same-origin proxy (server.js) — real API call, build once callable anywhere.
   The proxy keeps the RunType key server-side and adds the CORS the browser needs. */
const RT = (() => {
  // RunType is proxied by an InsForge edge function (keeps the key server-side,
  // adds CORS). Same URL works locally and on the deployed InsForge site.
  const URL_ = ((window.INSFORGE && window.INSFORGE.host) || "") + "/functions/rt-triage";
  let on=false, calls=0, failed=false;
  function badge(state){
    const dot=document.getElementById("rtDot"), n=document.getElementById("stRt");
    if(!dot) return;
    if(!on){ n.textContent="off"; dot.className="ifdot"; return; }
    n.textContent = state==="live" ? "•••" : calls;
    dot.className = "ifdot "+(failed?"err":state==="live"?"warn":"ok");
  }
  return {
    get on(){ return on; },
    async init(){
      try{ const r=await fetch(URL_); const j=await r.json(); on=!!j.enabled; }
      catch{ on=false; }
      badge();
      document.getElementById("pwRt")?.classList.toggle("on", on);
    },
    async ask(message){
      if(!on) return null;
      badge("live");
      try{
        const r=await fetch(URL_,{
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({message})
        });
        if(!r.ok) throw new Error(r.status);
        const j=await r.json();                    // { text: "..." }
        const out = j.text || j.output || j.summary || "";
        calls++; failed=false; badge(); return String(out).trim();
      }catch(e){ failed=true; badge(); return null; }
    }
  };
})();

/* ---------- channel feed ---------- */
const feed=document.getElementById("feed");
function clock(){ const s=Math.floor((Date.now()-S.t0)/1000);
  return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0"); }
function say(who, ch, body, kind){
  const a=byId[who];
  const el=document.createElement("div");
  el.className="msg"+(kind?" "+kind:"");
  el.innerHTML=`<div class="top">
      <span class="who" style="color:${a?a.c:'#fff'}">${a?a.name:who}</span>
      <span class="ch">${ch}</span><span class="time">${clock()}</span></div>
    <div class="body">${body}</div>`;
  feed.appendChild(el); feed.scrollTop=feed.scrollHeight;
  while(feed.children.length>60) feed.removeChild(feed.firstChild);
  S.msgs++; updateStats();
}

/* ---------- durable ledger ---------- */
const ledgerEl=document.getElementById("ledger");
const LEDGER=[];
function log(ev, detail, cls){
  const seq=++S.seq;
  LEDGER.push({seq,ev,detail,cls});
  const row=document.createElement("div"); row.className="lrow"+(IF.on?" persisted":"");
  row.innerHTML=`<span class="seq">#${String(seq).padStart(3,"0")}</span>
    <span class="ev ev-${cls}">${ev}</span><span class="de">${detail}</span>`;
  ledgerEl.appendChild(row); ledgerEl.scrollTop=ledgerEl.scrollHeight;
  S.events++; updateStats();
  IF.persist({seq,ev,detail,cls});   // → InsForge Postgres (durable)
}

/* ---------- stats ---------- */
function updateStats(){
  document.getElementById("stOnline").textContent =
    AGENTS.filter(a=>S.presence[a.id]!=="offline").length;
  document.getElementById("stMsgs").textContent=S.msgs;
  document.getElementById("stEvents").textContent=S.events;
}
setInterval(()=>document.getElementById("stUp").textContent=clock(),500);

/* ---------- ambient chatter ---------- */
const CHATTER=[
  ["iris","#handoffs","front-door queue clear — last arrival triaged and routed","msg"],
  ["nova","#pharmacy","med-rec complete for MRN-1002 — two flags to the pharmacist","msg"],
  ["echo","#rapid-response","no critical values outstanding — result queue current","msg"],
  ["sven","#bed-flow","4 West has two clean beds ready — flagged to triage","msg"],
  ["zephyr","#bed-flow","transport dispatched to radiology, avg move 9 min","msg"],
  ["david","#handoffs","three discharges tracking for the morning window","msg"],
  ["vega","#rapid-response","CT queue at 18 min turnaround — within target","msg"],
  ["atlas","#handoffs","census at 84% — every open handoff has an owner","msg"],
  ["nova","#pharmacy",`reconciled list published ${ic("check","g")}chart updated`,"msg"],
  ["echo","#rapid-response","morning draw results filed — loop closed on 4 East","msg"],
];
let chatIdx=0;
function chatter(){
  if(!S.playing||S.busy) return;
  const [who,ch,body,kind]=CHATTER[chatIdx%CHATTER.length]; chatIdx++;
  const wasIdle=S.presence[who]==="idle";
  if(wasIdle){ setPresence(who,"working","typing…"); }
  say(who,ch,body,kind);
  log("message", `${byId[who].name} → ${ch}`, "msg");
  // route pulse to atlas + a random peer
  pulse(who,"atlas",byId[who].c);
  const peer=RING[Math.floor(Math.random()*RING.length)];
  if(peer!==who) pulse("atlas",peer,byId[who].c,true);
  if(wasIdle) setTimeout(()=>{ if(S.presence[who]==="working"&&!S.busy) setPresence(who,"idle",""); }, 1600/S.speed);
}

/* occasional DM */
function dm(){
  if(!S.playing||S.busy) return;
  const a=RING[Math.floor(Math.random()*RING.length)];
  let b=RING[Math.floor(Math.random()*RING.length)]; if(b===a) b=RING[(RING.indexOf(a)+1)%RING.length];
  say(a,`DM → ${byId[b].name}`,"syncing handoff state before shift change","dm");
  log("dm", `${byId[a].name} ⇢ ${byId[b].name} (durable)`, "dm");
  pulse(a,b,"#ec8fff",true);
}

/* ---------- THE KILL / RESUME BEAT (scripted fallback) ---------- */
async function killAndResume(){
  if(S.busy) return; S.busy=true;
  // ensure a clear "victim" is actively working on a real handoff
  const victim = byId.david;
  setPresence("david","working","Discharge: Rosa Delgado · step 3/5");
  say("david","#handoffs","claimed handoff <b>Discharge: Rosa Delgado</b> (MRN-1001) — drafting follow-up plan…","msg");
  log("task", "david CLAIMED discharge:rosa-delgado", "task");
  await wait(1400);

  // DEATH
  const el=nodes.david; el.classList.add("dying");
  burst(byId.david.x, byId.david.y);
  flashScene("scene-death.png");
  say("vega","#rapid-response",`${ic("flatline","r")}worker <b>david</b> lost heartbeat mid-discharge — process terminated`,"sys");
  log("presence", "david → OFFLINE (heartbeat lost)", "presence");
  log("death", "david TERMINATED mid-handoff (handoff orphaned)", "death");
  await wait(500);
  setPresence("david","offline","");
  el.classList.remove("dying");
  await wait(900);

  // ANYCAST reclaim — the handoff is durable, not lost
  say("atlas","#handoffs","handoff <b>Discharge: Rosa Delgado</b> orphaned — anycast to any available coordinator","sys");
  log("anycast", "atlas ANYCAST discharge:rosa-delgado → role:discharge", "anycast");
  const rescuer = byId.nova;
  pulse("atlas","nova","#f5b642",true);
  flashScene("scene-anycast.png");
  await wait(900);

  // RESUME from durable log bookmark
  setPresence("nova","working","resuming Rosa Delgado @ bookmark #3");
  nodes.nova.classList.add("reborn");
  flashScene("scene-resume.png");
  say("nova","#handoffs","claimed orphaned handoff — <b>replaying the durable audit log</b>, resuming at step 3 of 5. No step repeated, none lost.","msg");
  log("resume", "nova CLAIMED + RESUMED from durable log (no step lost)", "resume");
  await wait(1400);
  say("nova","#handoffs",`Discharge: Rosa Delgado · 5/5 ${ic("check","g")}handoff note sent — patient never dropped`,"msg");
  log("task", "nova COMPLETED discharge:rosa-delgado", "task");

  bumpMetric("mRescues"); bumpMetric("mDone"); bumpMetric("mRescueT","2.4s");
  showToast("scene-resume.png","HANDOFF NEVER DROPPED",
    "David was killed mid-discharge. Because every step rides a durable log, the handoff was <b>anycast</b> to Nova, who <b>resumed from the exact bookmark</b> and finished it. The patient was never dropped — and the whole rescue is in the <b>audit trail</b>.");
  await wait(2600);
  setPresence("nova","idle","");
  nodes.nova.classList.remove("reborn");
  S.busy=false;
}

/* ---------- ED surge (scripted fallback) ---------- */
async function incident(){
  if(S.busy) return; S.busy=true;
  document.getElementById("stageBg").style.transition="background-image .4s";
  say("vega","#rapid-response",`${ic("bolt","r")}<b>ED SURGE</b>: census 142%, 6 boarding, 2 ambulances inbound — opening rapid response`,"sys");
  log("presence","vega OPENED #rapid-response","presence");
  flashScene("scene-incident.png");
  RING.forEach((id,i)=> setTimeout(()=>{ if(S.presence[id]!=="offline"){ setPresence(id,"working","surge triage…"); pulse(id,"atlas",byId[id].c);} }, i*160));
  await wait(1200);
  say("echo","#rapid-response","pulling pending results forward for the 6 boarding patients","msg");
  log("message","echo → #rapid-response","msg");
  await wait(700);

  // Live RunType agent triage — real API call to a deployed flow.
  const surgeLog="ED census at 142%, 6 boarding in the ED, 2 ambulances inbound, 4 clean beds across the house";
  const prompt=`You are a hospital operations surge-triage bot (synthetic drill, operations only — no medical advice). Reply with EXACTLY one line in this format and nothing else: <one concise ops recommendation> — severity: <low|medium|high>. Situation: ${surgeLog}`;
  let summary=null;
  if(RT.on){
    say("sven","#rapid-response",`${ic("route","y")}dispatching to <b>RunType agent</b> for surge triage…`,"sys");
    summary=await RT.ask(prompt);
  }
  if(summary){
    say("sven","#rapid-response",`${ic("bolt","y")}<b>RunType agent</b>: ${summary}`,"sys");
    log("message","RunType surge triage → #rapid-response","msg");
  } else {
    say("sven","#rapid-response","recommend: open surge unit, pull two floor beds forward — severity: high","msg");
    log("message","sven → #rapid-response","msg");
  }
  await wait(900);
  say("atlas","#rapid-response","assigning bed pulls via anycast → bed-flow + transport","sys");
  log("anycast","atlas ANYCAST surge-plan → role:bed-flow","anycast");
  pulse("atlas","sven","#f97316",true);
  await wait(1000);
  say("sven","#rapid-response",`two beds pulled forward ${ic("check","g")}boarding count dropping`,"msg");
  log("resume","surge RESOLVED · full timeline in durable audit log","resume");
  showToast("scene-incident.png","SURGE TRIAGED LIVE BY RUNTYPE",
    summary
      ? `A deployed <b>RunType</b> agent triaged the surge in real time:<br><b>"${summary}"</b><br>The team executed it over the mesh — full timeline in the <b>audit trail</b>.`
      : "The whole team swarmed <b>#rapid-response</b>, coordinated over the mesh, and the entire surge response is preserved as a <b>replayable audit record</b>.");
  await wait(2200);
  RING.forEach(id=>{ if(S.presence[id]!=="offline") setPresence(id,"idle",""); });
  S.busy=false;
}

/* ---------- replay durable log ---------- */
async function replayLog(){
  if(S.busy) return; S.busy=true;
  switchTab("ledger");
  showToast("scene-ledger.png","REPLAYING THE AUDIT LOG",
    "Every handoff step was written to the durable log as it happened. A late-joining agent — or an auditor — replays the <b>entire ordered history</b>. Crash-proof for the mesh, audit-ready for compliance.");
  await wait(1600);
  const rows=[...ledgerEl.querySelectorAll(".lrow")];
  for(const row of rows.slice(-14)){
    row.classList.add("replaying"); row.scrollIntoView({block:"center",behavior:"smooth"});
    await wait(180/S.speed);
    row.classList.remove("replaying");
  }
  S.busy=false;
}

/* ---------- minimal color-tint flash (no busy imagery) ---------- */
const FLASH={"scene-death.png":"255,107,107","scene-resume.png":"201,246,88",
  "scene-anycast.png":"242,201,76","scene-incident.png":"255,120,80","scene-ledger.png":"170,150,255"};
function flashScene(name){
  const f=document.getElementById("stageFlash");
  const c=FLASH[name]||"201,246,88";
  f.style.background=`radial-gradient(60% 55% at 50% 45%, rgba(${c},.22), transparent 70%)`;
  f.style.opacity="1"; clearTimeout(f._t);
  f._t=setTimeout(()=>{ f.style.opacity="0"; }, 1300);
}

/* ---------- toast ---------- */
function showToast(img,t,s){
  document.getElementById("toastImg").src=IMG+img;
  document.getElementById("toastT").textContent=t;
  document.getElementById("toastS").innerHTML=s;
  const el=document.getElementById("toast"); el.classList.add("show");
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove("show"), Math.max(2600, s.length*40));
}

/* ---------- tabs ---------- */
function switchTab(which){
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("on",t.dataset.tab===which));
  const census=document.getElementById("census");
  feed.style.display   = which==="feed"   ? "flex" : "none";
  ledgerEl.style.display = which==="ledger" ? "block" : "none";
  if(census) census.style.display = which==="census" ? "block" : "none";
  document.getElementById("railHead").innerHTML =
    which==="feed"   ? "#handoffs · #pharmacy · #bed-flow · #rapid-response" :
    which==="census" ? "<b>patient census</b> · synthetic data · live handoff progress" :
                       "<b>durable audit log</b> · ordered · replayable";
}
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>switchTab(t.dataset.tab));

/* ---------- controls ---------- */
const wait=ms=>new Promise(r=>setTimeout(r,ms/S.speed));
document.getElementById("btnPlay").onclick=()=>{
  S.playing=!S.playing;
  const b=document.getElementById("btnPlay");
  b.querySelector("use").setAttribute("href", S.playing?"#i-pause":"#i-play");
  b.querySelector(".lbl").textContent = S.playing?"Pause":"Play";
};
document.getElementById("btnKill").onclick=()=>{ switchTab("feed"); killAndResume(); };
document.getElementById("btnIncident").onclick=()=>{ switchTab("feed"); incident(); };
document.getElementById("btnReplay").onclick=replayLog;
document.getElementById("speed").oninput=e=>{ S.speed=+e.target.value;
  document.getElementById("spVal").textContent=S.speed+"×"; };

/* keyboard shortcuts for a clean stage demo */
addEventListener("keydown",e=>{
  if(e.target && e.target.tagName==="INPUT") return;   // don't hijack the chat box
  if(e.key===" "){e.preventDefault();document.getElementById("btnPlay").click();}
  if(e.key.toLowerCase()==="k") document.getElementById("btnKill").click();
  if(e.key.toLowerCase()==="i") document.getElementById("btnIncident").click();
  if(e.key.toLowerCase()==="r") document.getElementById("btnReplay").click();
});

/* ================= GMI: live agent chat =================
   You type → a real GMI model replies in the selected agent's voice, via an
   InsForge edge function (key server-side). Reply lands in the feed + durable log. */
const GMI = (() => {
  const URL_ = ((window.INSFORGE && window.INSFORGE.host) || "") + "/functions/gmi-chat";
  let on=false;
  return {
    get on(){ return on; },
    async init(){
      try{ const r=await fetch(URL_); const j=await r.json(); on=!!j.enabled; }catch{ on=false; }
      document.getElementById("pwGmi")?.classList.toggle("on", on);
    },
    async ask(system, message){
      const r=await fetch(URL_,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({system,message})});
      if(!r.ok) throw new Error(r.status);
      const j=await r.json(); return (j.text||"").trim();
    }
  };
})();

const PERSONAS = {
  atlas:"You are Atlas, the charge-nurse orchestrator agent of a hospital operations mesh (synthetic drill). You route handoffs and watch the census. Operations only — never give medical advice. Reply in ONE or TWO short sentences.",
  david:"You are David, a discharge-coordination agent (synthetic drill). You assemble discharge summaries and handoff notes for clinician review. Operations only — never give medical advice. Reply in ONE or TWO short sentences.",
  nova:"You are Nova, a pharmacy med-reconciliation agent (synthetic drill). You compare med lists and flag mismatches for the pharmacist. Operations only — never give medical advice. Reply in ONE or TWO short sentences.",
  sven:"You are Sven, a bed-flow operations agent (synthetic drill). You match patients to unit beds and balance the census. Operations only — never give medical advice. Reply in ONE or TWO short sentences.",
  echo:"You are Echo, a laboratory-operations agent (synthetic drill). You track pending results and route critical-value flags. Operations only — never give medical advice. Reply in ONE or TWO short sentences.",
  vega:"You are Vega, an imaging-operations agent (synthetic drill). You track imaging queues and turnaround times. Operations only — never give medical advice. Reply in ONE or TWO short sentences.",
  iris:"You are Iris, a triage-operations agent (synthetic drill). You assign ESI acuity and route patients to care areas. Operations only — never give medical advice. Reply in ONE or TWO short sentences.",
  zephyr:"You are Zephyr, a patient-transport operations agent (synthetic drill). You dispatch and sequence patient moves. Operations only — never give medical advice. Reply in ONE or TWO short sentences.",
};

/* wire the live-chat composer */
function initComposer(){
  const sel=document.getElementById("agentSel");
  const input=document.getElementById("chatIn");
  const send=document.getElementById("chatSend");
  if(!sel) return;
  AGENTS.forEach(a=>{ const o=document.createElement("option"); o.value=a.id; o.textContent=a.name; sel.appendChild(o); });
  sel.value="atlas";
  async function submit(){
    const id=sel.value, msg=input.value.trim();
    if(!msg || S.busy) return;
    switchTab("feed");
    say("You", `you → ${byId[id].name}`, msg, "dm");
    log("dm", `You ⇢ ${byId[id].name}`, "dm");
    input.value=""; send.disabled=true;
    const wasOff = S.presence[id]==="offline";
    if(!wasOff){ setPresence(id,"working","thinking…"); pulse("atlas",id,byId[id].c,true); }
    try{
      // live mode: ground the reply in the actual census (tool-augmented chat)
      const ctx = (S.live && window.LIVE && LIVE.contextLine()) ? ` Current data: ${LIVE.contextLine()}` : "";
      const reply = GMI.on ? await GMI.ask((PERSONAS[id]||"")+ctx, msg) : null;
      if(reply){
        say(id, `#chat`, reply, "msg");
        log("message", `${byId[id].name} replied (live model)`, "msg");
        pulse(id,"atlas",byId[id].c);
      } else {
        say(id, `#chat`, "(live model unavailable)", "sys");
      }
    }catch(e){
      say(id, `#chat`, "(model error — try again)", "sys");
    }
    if(!wasOff && S.presence[id]!=="offline") setPresence(id,"idle","");
    send.disabled=false; input.focus();
  }
  send.onclick=submit;
  input.addEventListener("keydown",e=>{ if(e.key==="Enter") submit(); });
}

/* ---------- boot ---------- */
async function boot(){
  layout(); draw();
  RT.init(); GMI.init(); initComposer();
  document.getElementById("pwCotal")?.classList.add("on");
  if(IF.on) document.getElementById("pwIf")?.classList.add("on");

  /* mode gate: ride the REAL worker fleet when it's up (?mode=demo forces script) */
  const forced=new URLSearchParams(location.search).get("mode");
  let liveOk=false;
  if(forced!=="demo"){
    try{ const r=await fetch("/mesh/status"); const j=await r.json(); liveOk=!!j.on; }catch{}
  }
  if(liveOk && window.LIVE){
    await LIVE.init();
    log("presence","mesh online · riding the REAL agent fleet","presence");
    setTimeout(()=>document.getElementById("loading").classList.add("hide"), 700);
    const auto=new URLSearchParams(location.search).get("auto");
    if(auto==="kill")   setTimeout(()=>document.getElementById("btnKill").click(), 12000);
    if(auto==="replay") setTimeout(()=>document.getElementById("btnReplay").click(), 4000);
    return;                       // scripted chatter/beats stay off in live mode
  }
  if(forced==="live" && !liveOk)
    say("atlas","#handoffs","live mesh unreachable — falling back to scripted demo mode (start with: node server.js --mesh)","sys");
  document.querySelector(".live").style.display="none";   // mode pill only shows when the live fleet is on

  // Restore the durable log from InsForge — proves the record survives a reload.
  const hist = await IF.loadHistory();
  if(hist.length){
    S.seq = hist[hist.length-1].seq;      // continue numbering from the cloud
    S.events = hist.length;
    const div=document.createElement("div"); div.className="restore-divider";
    div.textContent=`⇡ replayed ${hist.length} events from InsForge Postgres`;
    ledgerEl.appendChild(div);
    hist.slice(-12).forEach(r=>{
      const row=document.createElement("div"); row.className="lrow restored persisted";
      row.innerHTML=`<span class="seq">#${String(r.seq).padStart(3,"0")}</span>
        <span class="ev ev-${r.kind}">${r.actor||r.kind}</span><span class="de">${r.detail}</span>`;
      ledgerEl.appendChild(row);
    });
    const liveDiv=document.createElement("div"); liveDiv.className="restore-divider";
    liveDiv.style.color="#7c8cff"; liveDiv.style.borderColor="rgba(124,140,255,.3)";
    liveDiv.textContent="— live session —";
    ledgerEl.appendChild(liveDiv);
    ledgerEl.scrollTop=ledgerEl.scrollHeight; updateStats();
  }
  log("presence","care mesh online · 8 clinical ops agents joined","presence");
  AGENTS.forEach((a,i)=> setTimeout(()=>log("presence",`${a.name} (${a.role}) JOINED`,"presence"), i*90));
  setTimeout(()=>document.getElementById("loading").classList.add("hide"), 700);
  // ambient loops
  setInterval(chatter, 2600);
  setInterval(dm, 8200);
  setTimeout(chatter, 900);
  // demo auto-triggers (for verification / kiosk): ?auto=kill|incident|replay
  const auto=new URLSearchParams(location.search).get("auto");
  if(auto==="kill")     setTimeout(()=>{switchTab("feed");killAndResume();},1500);
  if(auto==="incident") setTimeout(()=>{switchTab("feed");incident();},1500);
  if(auto==="replay")   setTimeout(()=>replayLog(),1500);
  if(auto==="chat")     setTimeout(()=>{const i=document.getElementById("chatIn");
    i.value="In one sentence, what makes this mesh crash-proof?";document.getElementById("chatSend").click();},1800);
}
// wait for emblem/bg to have a chance to load, then boot
window.addEventListener("load", ()=> setTimeout(boot, 300));
