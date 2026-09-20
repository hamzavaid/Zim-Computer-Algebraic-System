const { performance } = require("node:perf_hooks");
const core = require("../packages/core/dist");

const workloads = [
  {
    id: "parse-polynomial",
    run: () => core.parse("(x + 1)^8 - 2*x^3 + 7/11"),
  },
  {
    id: "simplify-radical",
    run: () => core.simplify(core.parse("sqrt(432) + 1/3 + 1/6")),
  },
  {
    id: "solve-polynomial",
    run: () => core.solve(core.parse("x^5 - x = 0"), { variable: "x", domain: "complex" }),
  },
  {
    id: "solve-system",
    run: () => core.solveSystem([core.parse("x + y = 5"), core.parse("x - y = 1")], ["x", "y"]),
  },
];

function runBenchmark({ iterations = 250 } = {}) {
  if (!Number.isInteger(iterations) || iterations < 1)
    throw new TypeError("iterations must be positive");
  return {
    schemaVersion: 1,
    iterations,
    generatedAt: new Date().toISOString(),
    runtime: process.version,
    workloads: workloads.map((workload) => {
      let failures = 0;
      const started = performance.now();
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        try {
          workload.run();
        } catch {
          failures += 1;
        }
      }
      const elapsedMs = performance.now() - started;
      return {
        id: workload.id,
        elapsedMs,
        operationsPerSecond: iterations / Math.max(elapsedMs / 1000, Number.EPSILON),
        failures,
      };
    }),
  };
}

if (require.main === module) process.stdout.write(`${JSON.stringify(runBenchmark(), null, 2)}\n`);

module.exports = { runBenchmark };
