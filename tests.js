/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");

function assert(name, condition) {
  if (!condition) {
    throw new Error(`Assertion failed: ${name}`);
  }
  console.log(`ok - ${name}`);
}

function assignLanes(events) {
  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEndTimes = [];
  const withLanes = [];

  sorted.forEach((event) => {
    let lane = laneEndTimes.findIndex((endTime) => endTime <= event.start);
    if (lane === -1) {
      lane = laneEndTimes.length;
      laneEndTimes.push(event.end);
    } else {
      laneEndTimes[lane] = event.end;
    }

    withLanes.push({ ...event, lane });
  });

  const laneCount = laneEndTimes.length;
  return withLanes.map((event) => ({ ...event, laneCount }));
}

function serializeState(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

function deserializeState(raw) {
  return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
}

function run() {
  const lanes = assignLanes([
    { start: 600, end: 660 },
    { start: 630, end: 690 },
    { start: 700, end: 730 },
  ]);
  assert("overlap produces 2 lanes", lanes[0].laneCount === 2);

  const state = { selectedCodes: ["CS2030S"], compact: true, weekPattern: "odd" };
  const encoded = serializeState(state);
  const decoded = deserializeState(encoded);
  assert("state roundtrip", decoded.weekPattern === "odd" && decoded.compact === true);

  const bindEventsPath = path.join(__dirname, "frontend", "js", "bindEvents.js");
  const bindEventsSource = fs.readFileSync(bindEventsPath, "utf8");

  // Regression check: module blocks must be treated as interactive so wrapper drag logic does not swallow clicks.
  assert("drag guard includes .event target", /closest\("[^"]*\.event/.test(bindEventsSource));
  // Regression check: tiny pointer jitter should not count as drag and suppress click.
  assert("drag threshold remains 6px", /Math\.abs\(dx\) > 6 \|\| Math\.abs\(dy\) > 6/.test(bindEventsSource));

  console.log("all tests passed");
}

run();
