const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { once } = require("node:events");
const { executeDirect } = require("../dist/clients/directClient");
const { executeOverHttp } = require("../dist/clients/protocolClient");
const { createGuiServer, MAX_REQUEST_BYTES } = require("../dist/server");

const workspace = path.resolve(__dirname, "../../..");
const dataset = JSON.parse(
  fs.readFileSync(path.join(workspace, "datasets/gui/week-11-13.json"), "utf8"),
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(workspace, "datasets/gui/manifest.json"), "utf8"),
);
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");

let server;
let endpoint;

test.before(async () => {
  server = createGuiServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  endpoint = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  server.close();
  await once(server, "close");
});

function assertExpectation(response, fixture) {
  assert.equal(response.status, fixture.expect.status, fixture.id);
  if (fixture.expect.status === "error") {
    assert.equal(response.error.code, fixture.expect.errorCode, fixture.id);
    if (fixture.expect.position) assert.equal(typeof response.error.start, "number", fixture.id);
    return;
  }
  if (fixture.expect.text) assert.equal(response.result.text, fixture.expect.text, fixture.id);
  if (fixture.expect.latex) assert.equal(typeof response.result.latex, "string", fixture.id);
  if (fixture.expect.ast) assert.equal(typeof response.result.ast, "object", fixture.id);
  if (fixture.expect.steps) assert.ok(response.result.steps.length > 0, fixture.id);
  if (fixture.expect.stepRule) {
    assert.ok(
      response.result.steps.every((step) => step.rule === fixture.expect.stepRule),
      fixture.id,
    );
  }
}

test("Week 11-13 dataset is complete and milestone-balanced", () => {
  assert.equal(manifest.status, "implemented-gui-milestones");
  assert.equal(manifest.datasets[0].cases, 18);
  assert.equal(dataset.length, 18);
  assert.deepEqual([...new Set(dataset.map((fixture) => fixture.week))], [11, 12, 13]);
});

test("direct TypeScript proof-of-concept uses API v1", () => {
  for (const fixture of dataset.filter((entry) => entry.transport === "direct")) {
    assertExpectation(executeDirect(fixture.request), fixture);
  }
});

test("protocol proof-of-concept and primary GUI workflows use the same API", async () => {
  for (const fixture of dataset.filter((entry) => entry.transport === "http")) {
    assertExpectation(await executeOverHttp(endpoint, fixture.request), fixture);
  }
});

test("GUI exposes the required accessible controls and inspection panels", async () => {
  const response = await fetch(endpoint);
  assert.equal(response.status, 200);
  const servedHtml = await response.text();
  assert.equal(servedHtml, html);
  assert.match(servedHtml, /id=["']math-output["']/);
  for (const fixture of dataset.filter((entry) => entry.transport === "ui")) {
    if (fixture.expect.element) {
      assert.match(servedHtml, new RegExp(`id=["']${fixture.expect.element}["']`), fixture.id);
    }
    if (fixture.expect.attribute) {
      assert.match(servedHtml, new RegExp(fixture.expect.attribute), fixture.id);
    }
    for (const format of fixture.expect.copyFormats ?? []) {
      assert.match(servedHtml, new RegExp(`data-copy=["']${format}["']`), fixture.id);
    }
  }
});

test("browser rendering uses safe native MathML and backend-provided steps", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/browser/app.ts"), "utf8");
  assert.match(source, /createElementNS\(mathNamespace/);
  assert.match(source, /renderSteps\(result\.steps\)/);
  assert.doesNotMatch(source, /innerHTML/);
});

test("server rejects oversized and malformed requests safely", async () => {
  const oversized = await fetch(`${endpoint}/api/v1`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "x".repeat(MAX_REQUEST_BYTES + 1),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "REQUEST_TOO_LARGE");

  const malformed = await fetch(`${endpoint}/api/v1`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{bad json",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, "INVALID_JSON");
});

test("GUI and core packages remain independently versionable", () => {
  const corePackage = JSON.parse(
    fs.readFileSync(path.join(workspace, "packages/core/package.json"), "utf8"),
  );
  const guiPackage = JSON.parse(
    fs.readFileSync(path.join(workspace, "packages/gui/package.json"), "utf8"),
  );
  assert.equal(corePackage.dependencies?.["@zim/gui"], undefined);
  assert.equal(guiPackage.dependencies["@zim/core"], corePackage.version);
  const guiSources = [
    "src/server.ts",
    "src/clients/directClient.ts",
    "src/clients/protocolClient.ts",
  ].map((file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8"));
  assert.ok(guiSources.every((source) => !source.includes("@zim/core/dist")));
});
