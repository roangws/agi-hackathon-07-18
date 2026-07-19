/* The money-shot invariant, as a test:
   kill a worker mid-task → another worker rescues → resumes at bookmark+1 →
   every step appears exactly once in the durable log. Run: node engine/test-resume.js */
const { spawn } = require("child_process");
const db = require("./db");

const TID = "t01";                       // discharge-summary, 5 steps
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failures++; };
const worker = id => spawn("node", ["engine/worker.js", id],
  { env: { ...process.env, STEP_PACE_MS: "1500" }, stdio: "ignore" });

(async () => {
  // isolate: only TID is claimable
  await db.patch("care_tasks", "status=eq.requested", { status: "held_for_test" });
  await db.patch("care_tasks", "status=eq.in_progress", { status: "held_for_test" });
  await db.patch("care_tasks", `tid=eq.${TID}`,
    { status: "requested", owner_agent: null, bookmark: 0, artifacts: [], depends_on: null });
  await db.del("mesh_log", `task_id=eq.${TID}`);

  console.log("… spawning worker A (david)");
  const A = worker("david");

  // wait until A has durably logged at least 2 steps
  let t;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    [t] = await db.q("care_tasks", `tid=eq.${TID}`);
    if (t.bookmark >= 2) break;
  }
  check(t.bookmark >= 2, `worker A reached bookmark ${t.bookmark} (≥2)`);
  const killedAt = t.bookmark;

  console.log(`… SIGKILL worker A mid-task at bookmark ${killedAt}`);
  A.kill("SIGKILL");

  console.log("… spawning worker B (nova) — must rescue, not restart");
  const B = worker("nova");

  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    [t] = await db.q("care_tasks", `tid=eq.${TID}`);
    if (t.status === "completed") break;
  }
  B.kill("SIGKILL");
  check(t.status === "completed", `task completed (status=${t.status})`);
  check(t.owner_agent === "nova", `finished by rescuer (owner=${t.owner_agent})`);

  const log = await db.q("mesh_log", `task_id=eq.${TID}&order=created_at.asc&limit=100`);
  const stepNums = log.filter(r => r.kind === "task_step")
    .map(r => Number(r.body.match(/^\[(\d+)\//)?.[1]));
  const expected = t.steps.length;
  const uniq = new Set(stepNums);
  check(stepNums.length === expected, `exactly ${expected} step events (got ${stepNums.length})`);
  check(uniq.size === expected, "no step number repeated");
  const rescue = log.find(r => r.kind === "task_rescued");
  check(!!rescue, "task_rescued event present");
  check(!!rescue && rescue.body.includes(`bookmark #${killedAt}`),
    `rescue resumed at bookmark #${killedAt}`);
  const davidSteps = log.filter(r => r.kind === "task_step" && r.agent === "david").length;
  const novaSteps = log.filter(r => r.kind === "task_step" && r.agent === "nova").length;
  check(davidSteps === killedAt && novaSteps === expected - killedAt,
    `split is real: david did ${davidSteps}, nova did ${novaSteps}`);

  // restore parked tasks
  await db.patch("care_tasks", "status=eq.held_for_test", { status: "requested" });
  process.exit(failures ? 1 : 0);
})().catch(async e => {
  console.error("ERROR", e.message);
  await db.patch("care_tasks", "status=eq.held_for_test", { status: "requested" }).catch(() => {});
  process.exit(1);
});
