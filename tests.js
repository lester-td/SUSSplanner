/* eslint-disable no-console */
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

  console.log("all tests passed");
}

run();
