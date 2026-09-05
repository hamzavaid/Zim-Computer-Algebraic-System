const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("../dist");

test("all captured legacy regression inputs parse with the Zim 2 parser", () => {
  const fixturePath = path.resolve(__dirname, "../../../datasets/regression/legacy-cases.json");
  const cases = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  assert.ok(cases.length >= 25);
  for (const item of cases) assert.doesNotThrow(() => parse(item.input), item.input);
});
