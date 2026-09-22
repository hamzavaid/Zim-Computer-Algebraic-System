const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../../core/dist");
const { presentResult } = require("../public/resultPresenter");

test("pretty symbolic values preserve expression grouping", () => {
  for (const source of ["2/(y+1)", "(a+b)*c", "a-(b-c)", "(a^b)^c"]) {
    const tree = core.parse(source);
    const value = core.serializeSyntaxTree(tree);
    const presented = presentResult(
      "solveNonlinearSystem",
      { kind: "finite", solutions: [{ values: { x: value }, verified: true }] },
      ["x"],
    );
    const text = presented.text.split("x = ")[1].trim();
    assert.ok(core.treeEquals(core.parse(text), tree), `${source} was rendered as ${text}`);
  }
});
