/* Cotal Command Deck — tiny zero-dependency server.
   Serves the static deck AND proxies RunType server-side so:
     (a) the browser hits a same-origin endpoint (RunType's API omits CORS
         headers on POST responses, so a direct browser fetch is blocked), and
     (b) the RunType API key stays on the server, never shipped to the client.
   Run:  node server.js   (reads RUNTYPE_* from .env) */
const http = require("http"), https = require("https"),
      fs = require("fs"), path = require("path"), url = require("url");

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

const server = http.createServer((req, res) => {
  const p = url.parse(req.url).pathname;

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
  console.log(`Cotal Command Deck → http://localhost:${PORT}` +
    (RT_ON ? "  · RunType proxy ON" : "  · RunType off (set RUNTYPE_* in .env)")));
