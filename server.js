/* Cotal Care Deck — tiny zero-dependency server.
   Serves the static deck, proxies RunType server-side, and (with --mesh)
   runs the REAL agent fleet: 8 worker child processes with kill/revive
   control endpoints, so the "agent dies, handoff survives" beat is a real
   SIGKILL against a real OS process.
   Run:  node server.js --mesh   (reads keys from .env) */
const http = require("http"), https = require("https"),
      fs = require("fs"), path = require("path"), url = require("url"),
      { spawn } = require("child_process");

// --- load .env ---
const env = {};
try {
  fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n").forEach(l => {
    const m = l.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  });
} catch {}

const RT_BASE = env.RUNTYPE_BASE, RT_KEY = env.RUNTYPE_KEY,
      RT_CAP = env.RUNTYPE_CAP || "hachathon_agent";
const RT_ON = !!(RT_BASE && RT_KEY);
const PORT = process.env.PORT || 8099;

const MIME = {".html":"text/html",".js":"text/javascript",".css":"text/css",
  ".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",
  ".json":"application/json",".ico":"image/x-icon",".md":"text/markdown"};

function serveStatic(req, res) {
  let p = decodeURIComponent(url.parse(req.url).pathname);
  if (p === "/") p = "/index.html";
  const fp = path.join(__dirname, p);
  if (!fp.startsWith(__dirname)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(fp, (e, data) => {
    if (e) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    res.end(data);
  });
}

/* ================= real agent fleet ================= */
const MESH_ON = process.argv.includes("--mesh") || process.env.MESH === "on";
const FLEET = {};                 // agentId -> { proc, alive, bootRetried }
let ROSTER = [];
if (MESH_ON) {
  ROSTER = require("./engine/personas").ROSTER;
  ROSTER.forEach(a => spawnWorker(a.id));
}

function spawnWorker(id) {
  const proc = spawn(process.execPath, [path.join(__dirname, "engine", "worker.js"), id],
    { stdio: ["ignore", "inherit", "inherit"] });
  FLEET[id] = { proc, alive: true, bootRetried: FLEET[id]?.bootRetried || false };
  proc.on("exit", (code, sig) => {
    const f = FLEET[id];
    if (!f || f.proc !== proc) return;
    f.alive = false;
    // A crash within 5s of boot gets one retry; a kill stays dead until /mesh/revive —
    // death must be visible, not silently auto-healed.
    if (sig !== "SIGKILL" && proc.spawnargs && (Date.now() - f.bornAt < 5000) && !f.bootRetried) {
      f.bootRetried = true;
      setTimeout(() => spawnWorker(id), 1000);
    }
  });
  FLEET[id].bornAt = Date.now();
  return proc;
}

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise(resolve => {
    let b = ""; req.on("data", c => b += c);
    req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } });
  });
}

async function handleMesh(p, req, res) {
  if (p === "/mesh/status")
    return json(res, 200, {
      on: MESH_ON,
      agents: Object.entries(FLEET).map(([id, f]) => ({ id, pid: f.proc.pid, alive: f.alive })),
    });
  if (!MESH_ON) return json(res, 503, { error: "mesh off — start with: node server.js --mesh" });

  if (p === "/mesh/kill" && req.method === "POST") {
    const { agent } = await readBody(req);
    const f = FLEET[agent];
    if (!f || !f.alive) return json(res, 404, { error: `no live worker '${agent}'` });
    const pid = f.proc.pid;
    f.proc.kill("SIGKILL");                       // a real SIGKILL on a real process
    return json(res, 200, { killed: agent, pid });
  }
  if (p === "/mesh/revive" && req.method === "POST") {
    const { agent } = await readBody(req);
    if (!ROSTER.find(a => a.id === agent)) return json(res, 404, { error: `unknown agent '${agent}'` });
    if (FLEET[agent]?.alive) return json(res, 200, { revived: agent, note: "already alive" });
    spawnWorker(agent);
    return json(res, 200, { revived: agent, pid: FLEET[agent].proc.pid });
  }
  if (p === "/mesh/reset" && req.method === "POST") {
    const seed = spawn(process.execPath, [path.join(__dirname, "engine", "seed.js")], { stdio: "inherit" });
    seed.on("exit", code => json(res, code === 0 ? 200 : 500, { reset: code === 0 }));
    return;
  }
  json(res, 404, { error: "unknown mesh endpoint" });
}

const server = http.createServer((req, res) => {
  const p = url.parse(req.url).pathname;

  if (p.startsWith("/mesh/")) return handleMesh(p, req, res);

  if (p === "/rt/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ enabled: RT_ON, capability: RT_CAP }));
  }

  if (p === "/rt/dispatch" && req.method === "POST") {
    if (!RT_ON) { res.writeHead(503); return res.end(JSON.stringify({ error: "runtype not configured" })); }
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      let message = "";
      try { message = JSON.parse(body).message || ""; } catch {}
      const payload = JSON.stringify({ capability: RT_CAP, input: { message } });
      const u = new URL(RT_BASE + "/dispatch");
      const preq = https.request(u, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + RT_KEY,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      }, pres => {
        let out = ""; pres.on("data", c => out += c);
        pres.on("end", () => {
          res.writeHead(pres.statusCode || 502, { "Content-Type": "application/json" });
          res.end(out);
        });
      });
      preq.on("error", e => { res.writeHead(502); res.end(JSON.stringify({ error: String(e) })); });
      preq.write(payload); preq.end();
    });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () =>
  console.log(`Cotal Care Deck → http://localhost:${PORT}` +
    (MESH_ON ? `  · REAL mesh: ${Object.keys(FLEET).length} agent processes` : "  · mesh off (run with --mesh)") +
    (RT_ON ? "  · RunType proxy ON" : "")));

process.on("exit", () => Object.values(FLEET).forEach(f => { try { f.proc.kill("SIGKILL"); } catch {} }));
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
