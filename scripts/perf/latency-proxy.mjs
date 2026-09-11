/**
 * A TCP proxy in front of Postgres that adds a fixed one-way delay, and counts
 * how many query messages cross it.
 *
 * This exists because the whole point of the AppShell fix is that seven
 * *sequential* round trips cost the sum of seven latencies. On a database
 * running on the same machine a round trip is ~0.2 ms, so the difference between
 * serial and parallel is inside the noise and the optimisation looks worthless.
 * Production talks to a managed Postgres on another host, where a round trip is
 * tens of milliseconds. Measuring against localhost would have been measuring
 * the wrong thing and concluding the wrong thing.
 *
 * 15 ms one way (30 ms round trip) is a normal same-region managed database.
 *
 * Query counting reads the first byte of each client packet: 'Q' is a simple
 * query and 'P' is a Parse, which is what node-postgres sends for a
 * parameterised statement. Close enough to count round trips, which is the
 * number that actually matters here.
 *
 *   node scripts/perf/latency-proxy.mjs [listenPort] [delayMs]
 */
import net from "node:net";

const LISTEN = Number(process.argv[2] || 6432);
const DELAY = Number(process.argv[3] ?? 15);
const TARGET = { host: "127.0.0.1", port: 5432 };

let queries = 0;

function delayedWrite(sock, chunk) {
  setTimeout(() => {
    if (!sock.destroyed) sock.write(chunk);
  }, DELAY);
}

net
  .createServer((client) => {
    const upstream = net.createConnection(TARGET);
    client.on("data", (d) => {
      const tag = String.fromCharCode(d[0]);
      if (tag === "Q" || tag === "P") queries++;
      delayedWrite(upstream, d);
    });
    upstream.on("data", (d) => delayedWrite(client, d));
    const bye = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on("error", bye);
    client.on("close", bye);
    upstream.on("error", bye);
    upstream.on("close", bye);
  })
  .listen(LISTEN, "127.0.0.1", () =>
    console.log(`latency-proxy :${LISTEN} -> 5432, +${DELAY}ms each way`)
  );

// A tiny control channel so the measurement script can read and reset the
// counter without parsing logs.
net
  .createServer((s) => {
    s.on("data", (d) => {
      const cmd = d.toString().trim();
      if (cmd === "reset") queries = 0;
      s.write(String(queries) + "\n");
      s.end();
    });
  })
  .listen(LISTEN + 1, "127.0.0.1");
