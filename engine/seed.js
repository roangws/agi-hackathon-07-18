/* Cotal Care Deck — wipe + reseed synthetic data. 100% artificial patients:
   no real PHI anywhere. Run: node engine/seed.js                              */
const db = require("./db");
const { ROSTER } = require("./personas");

/* ---------- synthetic patients (FHIR Patient-shaped essentials) ---------- */
const PATIENTS = [
  { pid: "p01", mrn: "MRN-1001", name: "Rosa Delgado",    age: 71, sex: "F", conditions: ["CHF exacerbation"],            acuity: 2 },
  { pid: "p02", mrn: "MRN-1002", name: "Marcus Webb",     age: 58, sex: "M", conditions: ["NSTEMI, post-cath"],           acuity: 2 },
  { pid: "p03", mrn: "MRN-1003", name: "Lena Okafor",     age: 34, sex: "F", conditions: ["Community-acquired pneumonia"],acuity: 3 },
  { pid: "p04", mrn: "MRN-1004", name: "Tomás Rivera",    age: 82, sex: "M", conditions: ["Hip fracture, post-op day 2"], acuity: 3 },
  { pid: "p05", mrn: "MRN-1005", name: "June Park",       age: 45, sex: "F", conditions: ["DKA, resolving"],              acuity: 2 },
  { pid: "p06", mrn: "MRN-1006", name: "Ahmed Hassan",    age: 63, sex: "M", conditions: ["COPD exacerbation"],           acuity: 3 },
  { pid: "p07", mrn: "MRN-1007", name: "Bea Kowalski",    age: 77, sex: "F", conditions: ["UTI, delirium workup"],        acuity: 3 },
  { pid: "p08", mrn: "MRN-1008", name: "Devon Cole",      age: 29, sex: "M", conditions: ["Appendectomy, post-op"],       acuity: 4 },
  { pid: "p09", mrn: "MRN-1009", name: "Priya Nair",      age: 51, sex: "F", conditions: ["Cellulitis, IV antibiotics"],  acuity: 4 },
  { pid: "p10", mrn: "MRN-1010", name: "Sam Whitfield",   age: 68, sex: "M", conditions: ["GI bleed, stable"],            acuity: 2 },
  { pid: "p11", mrn: "MRN-1011", name: "Ingrid Larsen",   age: 88, sex: "F", conditions: ["Pneumonia, goals-of-care"],    acuity: 3 },
  { pid: "p12", mrn: "MRN-1012", name: "Caleb Nguyen",    age: 41, sex: "M", conditions: ["New-onset AFib"],              acuity: 3 },
];

/* ---------- task templates: steps carry the LLM prompt + a canned fallback ---------- */
function steps(kind, p) {
  const who = `${p.name} (${p.mrn}, ${p.age}${p.sex}, ${p.conditions.join("; ")})`;
  const base = `Synthetic hospital-operations drill — artificial patient, not medical advice. Patient: ${who}. `;
  const mk = (label, ask, fallback) => ({ label, prompt: base + ask + " Reply with the artifact only, 1-2 sentences.", fallback });
  switch (kind) {
    case "discharge-summary": return [
      mk("Review chart",              "Write a one-line chart-review note covering admission course.",            "Chart reviewed: admission course stable, ready to plan discharge."),
      mk("Reconcile medication list", "Write a one-line med-reconciliation note (home vs inpatient list).",       "Home and inpatient med lists reconciled; no conflicts outstanding."),
      mk("Draft follow-up plan",      "Draft a one-line outpatient follow-up plan.",                              "Follow-up: PCP visit within 7 days; labs prior to visit."),
      mk("Compose discharge summary", "Compose a two-sentence discharge summary for the chart.",                  "Discharge summary drafted and filed to the chart for physician review."),
      mk("Send handoff note",         "Write a one-line handoff note to the receiving care team.",                "Handoff note sent to receiving team; discharge packet complete."),
    ];
    case "triage-assessment": return [
      mk("Review chief complaint",    "Write a one-line intake note for the presenting complaint.",               "Intake note recorded for presenting complaint."),
      mk("Score acuity (ESI)",        "Assign an ESI acuity level with a one-line rationale.",                    "ESI level assigned per protocol; rationale filed."),
      mk("Order initial workup",      "List the initial workup orders in one line for clinician sign-off.",       "Initial workup queued for clinician sign-off."),
      mk("Assign care area",          "Assign a care area and write the one-line routing note.",                  "Care area assigned; routing note posted to #handoffs."),
    ];
    case "med-reconciliation": return [
      mk("Pull home med list",        "Write a one-line note confirming the home medication list was retrieved.", "Home medication list retrieved from intake records."),
      mk("Compare against orders",    "Write a one-line comparison of home meds vs active inpatient orders.",     "Home meds compared against inpatient orders; differences noted."),
      mk("Flag interactions",         "Write a one-line interaction-flag note for pharmacist review.",            "Potential interactions flagged for pharmacist review."),
      mk("Publish reconciled list",   "Write a one-line note publishing the reconciled list to the chart.",       "Reconciled medication list published to the chart."),
    ];
    case "bed-assignment": return [
      mk("Check unit census",         "Write a one-line census check across candidate units.",                    "Census checked: capacity available on receiving unit."),
      mk("Match acuity to unit",      "Write a one-line unit-match note based on acuity.",                        "Acuity matched to appropriate unit level."),
      mk("Reserve bed",               "Write a one-line bed reservation confirmation.",                           "Bed reserved; unit clerk notified."),
      mk("Notify transport",          "Write a one-line transport dispatch note.",                                "Transport dispatched; ETA posted to #bed-flow."),
    ];
    case "lab-followup": return [
      mk("Fetch pending results",     "Write a one-line note on pending lab results retrieved.",                  "Pending results retrieved from the lab interface."),
      mk("Flag critical values",      "Write a one-line critical-value screen note.",                             "Critical-value screen complete; flags routed if any."),
      mk("Notify ordering agent",     "Write a one-line notification note to the ordering team.",                 "Ordering team notified of resulted labs."),
      mk("File to chart",             "Write a one-line note confirming results filed to the chart.",             "Results filed to the chart; loop closed."),
    ];
  }
}

const TASKS = [
  ["t01", "discharge-summary",  "Discharge: Rosa Delgado",        "p01"],
  ["t02", "triage-assessment",  "Triage: Caleb Nguyen",           "p12"],
  ["t03", "med-reconciliation", "Med rec: Marcus Webb",           "p02"],
  ["t04", "bed-assignment",     "Bed: Lena Okafor",               "p03"],
  ["t05", "lab-followup",       "Labs: June Park",                "p05"],
  ["t06", "discharge-summary",  "Discharge: Devon Cole",          "p08"],
  ["t07", "med-reconciliation", "Med rec: Ahmed Hassan",          "p06"],
  ["t08", "bed-assignment",     "Bed: Tomás Rivera",              "p04"],
  ["t09", "lab-followup",       "Labs: Sam Whitfield",            "p10"],
  ["t10", "triage-assessment",  "Triage: Bea Kowalski",           "p07"],
  ["t11", "discharge-summary",  "Discharge: Priya Nair",          "p09"],
  ["t12", "med-reconciliation", "Med rec: Ingrid Larsen",         "p11"],
].map(([tid, kind, title, patient_id]) => {
  const p = PATIENTS.find(x => x.pid === patient_id);
  return {
    tid, kind, title, patient_id,
    status: "requested", owner_agent: null, heartbeat_at: null, bookmark: 0,
    steps: steps(kind, p).map((s, i) => ({ n: i + 1, ...s })),
    artifacts: [],
  };
});

(async () => {
  for (const t of ["patients", "care_tasks", "mesh_log", "agent_state"]) {
    // DELETE with an always-true filter wipes the table
    await db.del(t, t === "patients" ? "pid=neq._" : t === "care_tasks" ? "tid=neq._" : t === "agent_state" ? "aid=neq._" : "kind=neq._");
  }
  await db.insert("patients", PATIENTS);
  await db.insert("care_tasks", TASKS);
  await db.insert("agent_state", ROSTER.map(a => ({
    aid: a.id, name: a.name, role: a.role, status: "idle", task_label: "", heartbeat_at: null,
  })));
  const [np, nt, na] = await Promise.all([
    db.q("patients", "limit=100"), db.q("care_tasks", "limit=100"), db.q("agent_state", "limit=100"),
  ]);
  console.log(`seeded: ${np.length} patients, ${nt.length} tasks, ${na.length} agents`);
})().catch(e => { console.error(e.message); process.exit(1); });
