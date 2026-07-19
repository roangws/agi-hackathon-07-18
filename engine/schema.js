/* Cotal Care Deck — create (or recreate with --fresh) the engine tables.
   InsForge's table API reserves id/created_at/updated_at, so business keys get
   their own columns (pid, tid, aid). No serial type — mesh_log orders by created_at.
   Run: node engine/schema.js [--fresh]                                          */
const db = require("./db");

const col = (columnName, type, extra = {}) =>
  ({ columnName, type, isNullable: true, isUnique: false, ...extra });

const TABLES = {
  patients: [
    col("pid", "string", { isNullable: false, isUnique: true }),
    col("mrn", "string"),
    col("name", "string"),
    col("age", "integer"),
    col("sex", "string"),
    col("conditions", "json"),
    col("acuity", "integer"),        // 1 (critical) … 5 (stable), ESI-style
  ],
  care_tasks: [
    col("tid", "string", { isNullable: false, isUnique: true }),
    col("kind", "string"),
    col("title", "string"),
    col("patient_id", "string"),     // → patients.pid
    col("status", "string"),         // requested | in_progress | completed
    col("owner_agent", "string"),
    col("heartbeat_at", "datetime"),
    col("bookmark", "integer"),      // last durably-logged step (0 = none)
    col("steps", "json"),            // [{n, label, prompt, fallback}]
    col("artifacts", "json"),        // [{n, text, by}]
    col("depends_on", "string"),     // → care_tasks.tid; claimable only once parent completes
  ],
  mesh_log: [
    col("agent", "string"),
    col("channel", "string"),
    col("kind", "string"),           // message | task_claimed | task_step | task_rescued | task_completed | presence | dm
    col("body", "string"),
    col("task_id", "string"),
  ],
  agent_state: [
    col("aid", "string", { isNullable: false, isUnique: true }),
    col("name", "string"),
    col("role", "string"),
    col("status", "string"),         // idle | working | offline
    col("task_label", "string"),
    col("heartbeat_at", "datetime"),
  ],
};

(async () => {
  const fresh = process.argv.includes("--fresh");
  const names = await (async () => {
    const r = await fetch(`${db.HOST}/api/database/tables`, {
      headers: { Authorization: `Bearer ${db.KEY}` },
    });
    return r.json();
  })();
  for (const [name, columns] of Object.entries(TABLES)) {
    if (names.includes(name)) {
      if (!fresh) { console.log(`= ${name} exists`); continue; }
      await db.dropTable(name);
      console.log(`- dropped ${name}`);
    }
    await db.createTable(name, columns);
    console.log(`+ created ${name}`);
  }
  console.log("schema ok");
})().catch(e => { console.error(e.message); process.exit(1); });
