/* ================= COTAL COMMAND DECK =================
   A cinematic visualization of a Cotal-style multi-agent mesh:
   channels · DMs · presence · anycast · durable replayable log,
   culminating in the "agent survives death" beat.
   Pure vanilla JS. Self-driving simulation with live controls.        */

const IMG = "assets/img/";
document.getElementById("emblem").src = IMG + "emblem-cotal.png";
document.getElementById("stageBg").style.backgroundImage = `url(${IMG}bg-hero.png)`;

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
    persist(row){ if(on) queue.push({seq:row.seq,kind:row.cls,actor:row.ev,channel:"",detail:row.detail}); },
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

/* ---------- agents ---------- */
const AGENTS = [
  {id:"atlas",  name:"Atlas",  role:"Orchestrator", c:"#f5b642", center:true},
  {id:"david",  name:"David",  role:"Engineer",     c:"#3b82f6"},
  {id:"nova",   name:"Nova",   role:"Reviewer",     c:"#22c55e"},
  {id:"sven",   name:"Sven",   role:"Guide",        c:"#8b5cf6"},
  {id:"echo",   name:"Echo",   role:"Researcher",   c:"#06b6d4"},
  {id:"vega",   name:"Vega",   role:"Ops Sentinel", c:"#f97316"},
  {id:"iris",   name:"Iris",   role:"Designer",     c:"#ec4899"},
  {id:"zephyr", name:"Zephyr", role:"Analyst",      c:"#14b8a6"},
];
const byId = Object.fromEntries(AGENTS.map(a=>[a.id,a]));

/* who is linked to whom (drawn as mesh edges). Everyone links to Atlas + a peer ring. */
const RING = ["david","nova","sven","echo","vega","iris","zephyr"];

/* ---------- state ---------- */
const S = {
  playing:true, speed:1, t0:Date.now(),
  msgs:0, events:0, seq:0,
  pulses:[], particles:[], dying:new Set(), busy:false,
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
    <div class="avatar-wrap">
      <div class="ring"></div>
      <img src="${IMG}agent-${a.id}.png" onerror="this.src='${IMG}agent-generic.png'"/>
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
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7); ctx.fillStyle=`rgba(140,160,255,${p.a})`; ctx.fill();
  });
  // edges
  EDGES.forEach(([a,b])=>{
    const A=byId[a],B=byId[b];
    const off = S.presence[a]==="offline"||S.presence[b]==="offline";
    ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y);
    ctx.strokeStyle = off ? "rgba(90,70,90,.10)" : "rgba(120,140,220,.16)";
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

/* ---------- inline icon helper (no emojis) ---------- */
function ic(name,cls){ return `<svg class="mi ${cls||''}"><use href="#i-${name}"/></svg>`; }

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
  ["david","#build","pushing the auth refactor to the mesh branch","msg"],
  ["nova","#review","LGTM on the payload schema — one nit on retries","msg"],
  ["echo","#build","found 3 relevant papers on durable delivery, linking","msg"],
  ["iris","#build","new dashboard tokens are in, dark theme locked","msg"],
  ["zephyr","#ops","throughput steady at 1.2k msg/s across the mesh","msg"],
  ["sven","#build","reminder: everything here replays from JetStream","msg"],
  ["vega","#ops","presence heartbeat nominal on all nodes","msg"],
  ["david","#review","addressed feedback, re-requesting review","msg"],
  ["nova","#review",`approved ${ic("check","g")}merging`,"msg"],
  ["echo","#build","embedding the new docs into shared memory","msg"],
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
  say(a,`DM → ${byId[b].name}`,"syncing state before I hand this off","dm");
  log("dm", `${byId[a].name} ⇢ ${byId[b].name} (durable)`, "dm");
  pulse(a,b,"#ec8fff",true);
}

/* ---------- THE KILL / RESUME BEAT ---------- */
async function killAndResume(){
  if(S.busy) return; S.busy=true;
  // ensure a clear "victim" is actively working on a real task
  const victim = byId.david;
  setPresence("david","working","building payments-service · 62%");
  say("david","#build","claimed task <b>build:payments-service</b> — working…","msg");
  log("task", "david CLAIMED build:payments-service", "task");
  await wait(1400);

  // DEATH
  const el=nodes.david; el.classList.add("dying");
  burst(byId.david.x, byId.david.y);
  flashScene("scene-death.png");
  say("vega","#ops",`${ic("flatline","r")}node <b>david</b> lost heartbeat — process terminated`,"sys");
  log("presence", "david → OFFLINE (heartbeat lost)", "presence");
  log("death", "david TERMINATED mid-task (task orphaned)", "death");
  await wait(500);
  setPresence("david","offline","");
  el.classList.remove("dying");
  await wait(900);

  // ANYCAST reclaim — task is durable, not lost
  say("atlas","#ops","task <b>build:payments-service</b> orphaned — anycast to any available engineer","sys");
  log("anycast", "atlas ANYCAST build:payments-service → role:engineer", "anycast");
  // route packet visibly from atlas to the rescuer
  const rescuer = byId.nova;
  pulse("atlas","nova","#f5b642",true);
  flashScene("scene-anycast.png");
  await wait(900);

  // RESUME from durable log bookmark
  setPresence("nova","working","resuming payments-service @ bookmark #"+ (S.seq-2));
  nodes.nova.classList.add("reborn");
  flashScene("scene-resume.png");
  say("nova","#build","claimed orphaned task — <b>replaying from JetStream bookmark</b> #"+(S.seq-2)+" … resuming at 62%","msg");
  log("resume", "nova CLAIMED + RESUMED from durable log (no work lost)", "resume");
  await wait(1400);
  say("nova","#build",`payments-service · 100% ${ic("check","g")}done — zero work lost`,"msg");
  log("task", "nova COMPLETED build:payments-service", "task");

  showToast("scene-resume.png","AGENT SURVIVED DEATH",
    "David was killed mid-task. Because every message rides a durable JetStream log, the task was <b>anycast</b> to Nova, who <b>replayed from the exact bookmark</b> and finished it. Nothing was lost.");
  await wait(2600);
  setPresence("nova","idle","");
  nodes.nova.classList.remove("reborn");
  S.busy=false;
}

/* ---------- incident ---------- */
async function incident(){
  if(S.busy) return; S.busy=true;
  document.getElementById("stageBg").style.transition="background-image .4s";
  say("vega","#incident",`${ic("bolt","r")}<b>INCIDENT</b>: error rate spike in payments — opening incident room`,"sys");
  log("presence","vega OPENED #incident","presence");
  flashScene("scene-incident.png");
  RING.forEach((id,i)=> setTimeout(()=>{ if(S.presence[id]!=="offline"){ setPresence(id,"working","triaging…"); pulse(id,"atlas",byId[id].c);} }, i*160));
  await wait(1200);
  say("echo","#incident","correlating logs — spike started 40s ago on payments-service","msg");
  log("message","echo → #incident","msg");
  await wait(900);
  say("nova","#incident","reproduced. root cause: retry storm. proposing fix","msg");
  log("message","nova → #incident","msg");
  await wait(900);
  say("atlas","#incident","assigning fix via anycast → engineer","sys");
  log("anycast","atlas ANYCAST hotfix → role:engineer","anycast");
  pulse("atlas","david","#f97316",true);
  await wait(1000);
  say("david","#incident",`hotfix shipped ${ic("check","g")}error rate back to baseline`,"msg");
  log("resume","incident RESOLVED · full timeline in durable log","resume");
  showToast("scene-incident.png","INCIDENT RESOLVED LIVE",
    "The whole team swarmed <b>#incident</b>, coordinated over the mesh, and the entire triage is preserved as a <b>replayable record</b>.");
  await wait(2200);
  RING.forEach(id=>{ if(S.presence[id]!=="offline") setPresence(id,"idle",""); });
  S.busy=false;
}

/* ---------- replay durable log ---------- */
async function replayLog(){
  if(S.busy) return; S.busy=true;
  switchTab("ledger");
  showToast("scene-ledger.png","REPLAYING THE DURABLE LOG",
    "A late-joining agent reconnects and replays the <b>entire ordered history</b> from JetStream before going live — this is what makes the mesh crash-proof.");
  await wait(1600);
  const rows=[...ledgerEl.querySelectorAll(".lrow")];
  for(const row of rows.slice(-14)){
    row.classList.add("replaying"); row.scrollIntoView({block:"center",behavior:"smooth"});
    await wait(180/S.speed);
    row.classList.remove("replaying");
  }
  S.busy=false;
}

/* ---------- scene flash overlay ---------- */
function flashScene(name){
  const bg=document.getElementById("stageBg");
  bg.style.backgroundImage=`url(${IMG}${name})`;
  bg.style.opacity=".6";
  clearTimeout(bg._t);
  bg._t=setTimeout(()=>{ bg.style.backgroundImage=`url(${IMG}bg-hero.png)`; bg.style.opacity=".35"; }, 1600);
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
  const isFeed=which==="feed";
  feed.style.display=isFeed?"flex":"none";
  ledgerEl.style.display=isFeed?"none":"block";
  document.getElementById("railHead").innerHTML = isFeed
    ? "#build · #review · #ops · #incident"
    : "<b>durable JetStream log</b> · ordered · replayable";
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
  if(e.key===" "){e.preventDefault();document.getElementById("btnPlay").click();}
  if(e.key.toLowerCase()==="k") document.getElementById("btnKill").click();
  if(e.key.toLowerCase()==="i") document.getElementById("btnIncident").click();
  if(e.key.toLowerCase()==="r") document.getElementById("btnReplay").click();
});

/* ---------- boot ---------- */
async function boot(){
  layout(); draw();
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
  log("presence","mesh online · 8 agents joined","presence");
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
}
// wait for emblem/bg to have a chance to load, then boot
window.addEventListener("load", ()=> setTimeout(boot, 300));
