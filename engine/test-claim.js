/* Verify anycast claim atomicity: two agents race, exactly one wins.
   Run: node engine/test-claim.js  (exits 0 on PASS, 1 on FAIL)      */
const db = require("./db");

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

(async () => {
  // --- isolate: park every other requested task so the race targets race1 only ---
  await db.patch("care_tasks", "status=eq.requested", { status: "held_for_test" });
  await db.del("care_tasks", "tid=eq.race1");
  await db.insert("care_tasks", [{
    tid: "race1", kind: "test", title: "race test", patient_id: "p01",
    status: "requested", owner_agent: null, bookmark: 0, steps: [], artifacts: [],
  }]);
  const [a, b] = await Promise.all([db.claimNew("agentA"), db.claimNew("agentB")]);
  const winners = [a, b].filter(Boolean).filter(t => t.tid === "race1");
  check(winners.length === 1, `fresh claim: exactly one winner (got ${winners.length})`);

  // --- stale-rescue race ---
  const old = new Date(Date.now() - 60_000).toISOString();
  await db.patch("care_tasks", "tid=eq.race1", {
    status: "in_progress", owner_agent: "deadAgent", heartbeat_at: old,
  });
  const stale = new Date(Date.now() - 6_000).toISOString();
  const [r1, r2] = await Promise.all([db.claimStale("rescA", stale), db.claimStale("rescB", stale)]);
  const rescues = [r1, r2].filter(Boolean).filter(r => r.task.tid === "race1");
  check(rescues.length === 1, `stale rescue: exactly one winner (got ${rescues.length})`);
  check(rescues.length === 1 && rescues[0].from === "deadAgent", "rescue reports previous owner");

  // --- live owner is NOT rescueable ---
  await db.patch("care_tasks", "tid=eq.race1", { heartbeat_at: new Date().toISOString(), owner_agent: "aliveAgent" });
  const r3 = await db.claimStale("rescC", stale);
  check(!(r3 && r3.task.tid === "race1"), "fresh heartbeat is not stolen");

  // --- dependency gate: blocked task not claimable until parent completes ---
  await db.del("care_tasks", "tid=eq.dep_parent");
  await db.del("care_tasks", "tid=eq.dep_child");
  await db.insert("care_tasks", [
    { tid: "dep_parent", kind: "test", title: "parent", patient_id: "p01",
      status: "requested", owner_agent: null, bookmark: 0, steps: [], artifacts: [], depends_on: null },
    { tid: "dep_child", kind: "test", title: "child", patient_id: "p01",
      status: "requested", owner_agent: null, bookmark: 0, steps: [], artifacts: [], depends_on: "dep_parent" },
  ]);
  // hide the parent from claiming so only the child is a candidate
  await db.patch("care_tasks", "tid=eq.dep_parent", { status: "held_dep" });
  const blocked = await db.claimNew("depAgent");
  check(!(blocked && blocked.tid === "dep_child"), "blocked child not claimable while parent incomplete");
  await db.patch("care_tasks", "tid=eq.dep_parent", { status: "completed" });
  const unblocked = await db.claimNew("depAgent");
  check(!!unblocked && unblocked.tid === "dep_child", "child claimable once parent completed");
  await db.del("care_tasks", "tid=eq.dep_parent");
  await db.del("care_tasks", "tid=eq.dep_child");

  await db.del("care_tasks", "tid=eq.race1");
  await db.patch("care_tasks", "status=eq.held_for_test", { status: "requested" });
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("ERROR", e.message); process.exit(1); });
