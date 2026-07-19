/* ================= AGI HOSPITAL =================
   Live window onto a Cotal-style hospital ops mesh: the deck renders the
   real worker fleet's durable log, presence, and census. Pure vanilla JS. */

const IMG = "assets/img/";
const ORB = "assets/orbs/";
document.getElementById("emblem").src = ORB + "orb-atlas.png";

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
  const row=document.createElement("div"); row.className="lrow persisted";
  row.innerHTML=`<span class="seq">#${String(seq).padStart(3,"0")}</span>
    <span class="ev ev-${cls}">${ev}</span><span class="de">${detail}</span>`;
  ledgerEl.appendChild(row); ledgerEl.scrollTop=ledgerEl.scrollHeight;
  S.events++; updateStats();
}

/* ---------- stats ---------- */
function updateStats(){
  document.getElementById("stOnline").textContent =
    AGENTS.filter(a=>S.presence[a.id]!=="offline").length;
  document.getElementById("stMsgs").textContent=S.msgs;
  document.getElementById("stEvents").textContent=S.events;
}
setInterval(()=>document.getElementById("stUp").textContent=clock(),500);

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
/* kill / incident / replay buttons are wired by LIVE.init() */

/* keyboard shortcuts for a clean stage demo */
addEventListener("keydown",e=>{
  if(e.target && e.target.tagName==="INPUT") return;   // don't hijack the chat box
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

/* ---------- boot: the deck always rides the real mesh ---------- */
async function boot(){
  layout(); draw();
  RT.init(); GMI.init(); initComposer();
  document.getElementById("pwCotal")?.classList.add("on");
  document.getElementById("pwIf")?.classList.add("on");
  await LIVE.init();
  log("presence","mesh online · riding the agent fleet","presence");
  setTimeout(()=>document.getElementById("loading").classList.add("hide"), 700);
  const auto=new URLSearchParams(location.search).get("auto");
  if(auto==="kill")   setTimeout(()=>document.getElementById("btnKill").click(), 12000);
  if(auto==="replay") setTimeout(()=>document.getElementById("btnReplay").click(), 4000);
}
// wait for emblem/bg to have a chance to load, then boot
window.addEventListener("load", ()=> setTimeout(boot, 300));
