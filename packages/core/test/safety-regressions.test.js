const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../dist");
const relation = (text) => core.solveRelation(core.parse(text), { variable: "x" });
const solve = (text) => core.solve(core.parse(text), { variable: "x" });

test("exact nonlinear verification rejects tiny nonzero contradictions", () => {
  const result = core.solveNonlinearSystem(["x=0", "y=0", "x=0.000000001"].map(core.parse), [
    "x",
    "y",
  ]);
  assert.equal(result.kind, "no-solution");
});

test("Newton convergence verifies every original equation", () => {
  const result = core.solveNonlinearSystem(["x=0", "y=0", "x=1"].map(core.parse), ["x", "y"], {
    mode: "numeric",
    initialGuess: { x: 0, y: 0 },
  });
  assert.notEqual(result.kind, "finite");
});

test("radical verification rejects an exactly negative right side even near zero", () => {
  assert.equal(relation("sqrt(x)=-0.000000000001").solution.kind, "empty");
});

test("radical evidence names the actual radicand", () => {
  const conditions = relation("sqrt(2*x)=x").conditions.join(" ");
  assert.match(conditions, /2\s*\*\s*x/);
  assert.doesNotMatch(conditions, /x\s*\+\s*1/);
});

for (const source of ["x/(x^2-2)>0", "abs(1/x)>-1"]) {
  test(`unproved domain boundaries remain explicit: ${source}`, () => {
    assert.ok(relation(source).unsupportedReason);
  });
}

test("unsupported piecewise branch does not become an empty solution", () => {
  const result = core.solvePiecewise(
    [{ condition: core.parse("x>=0"), expression: core.parse("sin(x)") }],
    core.rational(1n, 2n),
    { variable: "x" },
  );
  assert.ok(result.unsupportedReason);
});

test("nested reciprocal never admits an undefined root", () => {
  assert.equal(solve("1/(1/x)=0").kind, "no-solution");
});

test("exact small nonzero rational roots are not treated as poles", () => {
  const result = solve("1/x=10000000000");
  assert.equal(result.kind, "solution");
  assert.equal(core.format(result.value), "1/10000000000");
});

test("rational identities retain excluded points", () => {
  const result = solve("x/x=1");
  assert.ok(result.kind === "unsupported" || (result.conditions?.length ?? 0) > 0);
});

test("irrational sign boundaries are complete or explicitly unsupported", () => {
  const response = core.executeV2({
    apiVersion: "2.0-beta",
    operation: "solveRelation",
    relation: "x*(x^2-2)<0",
    variable: "x",
  });
  assert.ok(response.status === "unsupported" || response.result?.solution.kind === "union");
});

test("sign charts handle no real roots", () => {
  assert.equal(relation("x^2+1>0").solution.kind, "universal");
});

test("sign charts retain exact tiny coefficient signs", () => {
  assert.equal(core.formatSolutionSet(relation("x/1000000000000>0").solution), "(0, ∞)");
});

test("absolute disequality includes the middle interval", () => {
  assert.equal(
    core.formatSolutionSet(relation("abs(x)!=1").solution),
    "(-∞, -1) ∪ (-1, 1) ∪ (1, ∞)",
  );
});

for (const expression of ["sqrt(x)=sin(x)", "abs(x)=sin(x)"]) {
  test(`unsupported subsolve is not mislabeled as an empty solution: ${expression}`, () => {
    const response = core.executeV2({
      apiVersion: "2.0-beta",
      operation: "solveRelation",
      relation: expression,
      variable: "x",
    });
    assert.equal(response.status, "unsupported");
  });
}

test("relation adapters retain symbolic nonzero conditions", () => {
  const result = relation("x*y=2");
  const conditions = [...result.conditions, ...(result.solution.conditions ?? [])];
  assert.ok(conditions.some((condition) => /y.*(!=|≠|nonzero)/.test(condition)));
});

test("nonlinear zero branches are independent of equation ordering", () => {
  for (const expressions of [
    ["x*y=0", "x+y=1"],
    ["x+y=1", "x*y=0"],
  ]) {
    const result = core.solveNonlinearSystem(expressions.map(core.parse), ["x", "y"]);
    assert.equal(result.kind, "finite");
    assert.deepEqual(
      result.solutions
        .map(({ values }) => [core.format(values.x), core.format(values.y)].join(","))
        .sort(),
      ["0,1", "1,0"],
    );
  }
});

test("underdetermined count alone does not prove positive real dimension", () => {
  for (const expression of ["x^2+y^2=-1", "x^2+y^2=0"]) {
    const result = core.solveNonlinearSystem([core.parse(expression)], ["x", "y"]);
    assert.notEqual(result.kind, "positive-dimensional", expression);
  }
});

test("zero multiplication does not erase an unknown denominator domain", () => {
  assert.notEqual(core.format(core.simplify(core.parse("0*(1/x)")).expression), "0");
});

test("malformed API v2 requests return invalid envelopes rather than throw", () => {
  for (const request of [
    null,
    [],
    42,
    { apiVersion: "2.0-beta", operation: "solveRelation" },
    {
      apiVersion: "2.0-beta",
      operation: "solveNonlinearSystem",
      equations: "x=1",
      variables: ["x"],
    },
    { apiVersion: "2.0-beta", operation: "parse", expression: "x", budget: { maxInputLength: -1 } },
  ]) {
    const response = core.executeV2(request);
    assert.equal(response.status, "invalid");
    assert.equal(response.apiVersion, "2.0-beta");
    assert.equal(typeof response.requestId, "string");
  }
});

test("input budgets apply equally to scalar, relation, and system requests", () => {
  for (const request of [
    { operation: "parse", expression: "x+123" },
    { operation: "solveRelation", relation: "x<123", variable: "x" },
    { operation: "solveSystem", expressions: ["x=123"], variables: ["x"] },
    { operation: "solveNonlinearSystem", equations: ["x=123"], variables: ["x"] },
  ]) {
    const response = core.executeV2({
      apiVersion: "2.0-beta",
      ...request,
      budget: { maxInputLength: 2 },
    });
    assert.equal(response.status, "budget-exceeded", request.operation);
  }
});

test("AST and nesting budgets are enforced by public dispatch", () => {
  const ast = core.executeV2({
    apiVersion: "2.0-beta",
    operation: "parse",
    expression: "x+x",
    budget: { maxAstNodes: 1 },
  });
  assert.equal(ast.status, "budget-exceeded");
  const nested = core.executeV2({
    apiVersion: "2.0-beta",
    operation: "parse",
    expression: "(((x)))",
    budget: { maxNestingDepth: 2 },
  });
  assert.equal(nested.status, "budget-exceeded");
});

test("operation-specific field types and duplicate variables are invalid", () => {
  for (const request of [
    { operation: "parse", expression: 4 },
    { operation: "solve", expression: "x=1", variable: "x", domain: "unknown" },
    { operation: "solveSystem", expressions: ["x=1"], variables: ["x", "x"] },
    { operation: "derive", expression: "x=1", variable: "x", renderMode: "unknown" },
  ]) {
    const response = core.executeV2({ apiVersion: "2.0-beta", ...request });
    assert.equal(response.status, "invalid");
  }
});
