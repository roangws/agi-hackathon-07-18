/* Cotal Care Deck — InsForge Postgres access for the engine (zero-dependency).
   Records REST API speaks PostgREST-style filters: ?col=eq.v, is.null, lt.<ts>.
   Atomicity model: a conditional PATCH is a single-statement UPDATE, so two
   workers racing for the same task get exactly one winner (loser sees []). */
const fs = require("fs"), path = require("path");

const env = {};
try {
  fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n").forEach(l => {
    const m = l.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  });
} catch {}

const HOST = env.INSFORGE_HOST;
const KEY = env.INSFORGE_KEY;
if (!HOST || !KEY) {
  console.error("engine/db.js: INSFORGE_HOST / INSFORGE_KEY missing from .env");
  process.exit(1);
}

const HDR = {
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation",
};

async function req(method, pathname, body) {
  const r = await fetch(`${HOST}${pathname}`, {
    method,
    headers: HDR,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${pathname} → ${r.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return text; }
}

const q      = (table, qs = "")   => req("GET",    `/api/database/records/${table}${qs ? "?" + qs : ""}`);
const insert = (table, rows)      => req("POST",   `/api/database/records/${table}`, rows);
const patch  = (table, qs, body)  => req("PATCH",  `/api/database/records/${table}?${qs}`, body);
const del    = (table, qs)        => req("DELETE", `/api/database/records/${table}?${qs}`);

const createTable = (tableName, columns) =>
  req("POST", "/api/database/tables", { tableName, rlsEnabled: false, columns });
const dropTable = (tableName) => req("DELETE", `/api/database/tables/${tableName}`);

/* Durable log append. Ordering rides created_at (server clock, µs precision). */
async function logEvent({ agent, channel = "", kind, body = "", task_id = null }) {
  const rows = await insert("mesh_log", [{ agent, channel, kind, body, task_id }]);
  return Array.isArray(rows) ? rows[0] : null;
}

/* A task is claimable when it has no dependency, or its parent completed. */
async function claimable(t) {
  if (!t.depends_on) return true;
  const parent = await q("care_tasks", `tid=eq.${t.depends_on}&limit=1`);
  return parent.length && parent[0].status === "completed";
}

/* Claim a fresh task: pick a `requested` row, then atomically take it.
   The WHERE owner_agent=is.null guard makes the race safe.
   preferredKind: specialists claim their own lane first, then anything —
   but anycast rescue (claimStale) stays role-agnostic. */
async function claimNew(agentId, preferredKind) {
  const open = await q("care_tasks", "status=eq.requested&owner_agent=is.null&limit=20");
  const ordered = preferredKind
    ? [...open.filter(t => t.kind === preferredKind), ...open.filter(t => t.kind !== preferredKind)]
    : open;
  for (const t of ordered) {
    if (!(await claimable(t))) continue;      // dependency gate
    const won = await patch(
      "care_tasks",
      `tid=eq.${t.tid}&owner_agent=is.null`,
      { owner_agent: agentId, status: "in_progress", heartbeat_at: new Date().toISOString() },
    );
    if (Array.isArray(won) && won.length) return won[0];
  }
  return null;
}

/* Rescue a stale task: owner's heartbeat lapsed past `staleISO`.
   The heartbeat_at=lt.<staleISO> guard is re-checked inside the UPDATE, so if
   the presumed-dead owner heartbeats first — or another rescuer wins — we see []. */
async function claimStale(agentId, staleISO) {
  const stale = await q(
    "care_tasks",
    `status=eq.in_progress&heartbeat_at=lt.${staleISO}&owner_agent=neq.${agentId}&limit=5`,
  );
  for (const t of stale) {
    const won = await patch(
      "care_tasks",
      `tid=eq.${t.tid}&heartbeat_at=lt.${staleISO}`,
      { owner_agent: agentId, heartbeat_at: new Date().toISOString() },
    );
    if (Array.isArray(won) && won.length) return { task: won[0], from: t.owner_agent };
  }
  return null;
}

module.exports = { HOST, KEY, q, insert, patch, del, createTable, dropTable, logEvent, claimNew, claimStale };
