// Measures TTFB for the repair funnel against a running build, plus counts the
// database round trips each route makes, by reading pg_stat_statements-free
// counters from pg_stat_database. Run as: node scripts/perf/measure.mjs <label> <port>
import net from "node:net";

const label = process.argv[2] || "run";
const port = process.argv[3] || "3000";
const base = `http://127.0.0.1:${port}`;

const ROUTES = [
  ["/repair", "Step 1 — brands"],
  ["/repair/samsung", "Step 2 — Samsung models"],
  ["/repair/samsung/samsung-model-1", "Step 3 — services"],
];

/** Ask scripts/perf/latency-proxy.mjs how many queries it has forwarded. */
function proxyCounter(cmd) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection(6433, "127.0.0.1");
    let buf = "";
    s.on("connect", () => s.write(cmd));
    s.on("data", (d) => (buf += d));
    s.on("end", () => resolve(Number(buf.trim())));
    s.on("error", reject);
  });
}
const queryCount = () => proxyCounter("read");

async function ttfb(path) {
  const t0 = performance.now();
  const res = await fetch(base + path, { headers: { "cache-control": "no-cache" } });
  const first = performance.now() - t0;
  await res.text();
  const full = performance.now() - t0;
  return { status: res.status, first, full };
}

const results = [];
for (const [path, name] of ROUTES) {
  await ttfb(path); // warm the route handler so we measure steady state
  await new Promise((r) => setTimeout(r, 150));

  const before = await queryCount();
  const samples = [];
  for (let i = 0; i < 12; i++) samples.push(await ttfb(path));
  const after = await queryCount();

  const ok = samples.filter((s) => s.status === 200);
  const times = ok.map((s) => s.full).sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const p95 = times[Math.min(times.length - 1, Math.floor(times.length * 0.95))];

  results.push({
    name,
    path,
    status: samples[0].status,
    median: +median.toFixed(1),
    p95: +p95.toFixed(1),
    txnsPerRequest: +((after - before) / samples.length).toFixed(1),
  });
}

console.log(`\n===== ${label} =====`);
for (const r of results) {
  console.log(
    `${r.name.padEnd(28)} status=${r.status}  median=${String(r.median).padStart(7)}ms  ` +
      `p95=${String(r.p95).padStart(7)}ms  db-txns/req=${r.txnsPerRequest}`
  );
}
