/* A small, data-only presenter shared by the browser and GUI tests. */
(function (root) {
  const precedence = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, unary: 3, "^": 4, atom: 5 };

  function expression(value, parent = 0, side = "") {
    if (value === null || value === undefined) return "?";
    if (typeof value !== "object") return String(value);
    if (value.kind === "constant") return String(value.value);
    if (value.kind === "rational") return `${value.numerator}/${value.denominator}`;
    if (value.kind === "variable") return String(value.name);
    if (value.kind === "unary") {
      const rendered = `${value.operator}${expression(value.operand, precedence.unary, "right")}`;
      return precedence.unary < parent ? `(${rendered})` : rendered;
    }
    if (value.kind === "binary") {
      const own = precedence[value.operator] ?? 0;
      const leftParent = value.operator === "^" ? own + 1 : own;
      const rightParent = ["-", "/", "%"].includes(value.operator) ? own + 1 : own;
      const left = expression(value.left, leftParent, "left");
      const right = expression(value.right, rightParent, "right");
      const rendered = `${left} ${value.operator} ${right}`;
      const equalPowerOnLeft = side === "left" && value.operator === "^" && own === parent;
      return own < parent || equalPowerOnLeft ? `(${rendered})` : rendered;
    }
    if (value.kind === "function")
      return `${value.name}(${(value.args ?? []).map((argument) => expression(argument)).join(", ")})`;
    return "symbolic value";
  }

  function state(result) {
    if (result.kind === "unsupported")
      return `Unsupported: ${result.reason ?? "outside the supported solver scope"}`;
    if (result.kind === "incomplete")
      return `Incomplete: ${result.reason ?? "the computation reached a limit"}`;
    return undefined;
  }

  function nonlinear(result, variables) {
    const failure = state(result);
    if (failure) return failure;
    if (result.kind === "positive-dimensional")
      return "Infinitely many solutions (positive-dimensional system).";
    if (result.kind !== "finite") return "No finite solution set was returned.";
    const solutions = Array.isArray(result.solutions) ? result.solutions : [];
    const lines = [
      `${solutions.length} solution${solutions.length === 1 ? "" : "s"}${result.method ? ` · ${result.method}` : ""}`,
    ];
    for (const [index, solution] of solutions.entries()) {
      const values = solution.values ?? {};
      const names = [
        ...variables.filter((name) => name in values),
        ...Object.keys(values).filter((name) => !variables.includes(name)),
      ];
      lines.push(
        `${index + 1}. ${names.map((name) => `${name} = ${expression(values[name])}`).join(", ")}`,
      );
      if (solution.verified === false) lines.push("   Not independently verified");
      if (typeof solution.residual === "number" && solution.residual > 0)
        lines.push(`   Residual: ${solution.residual.toExponential(3)}`);
    }
    return lines.join("\n");
  }

  function polynomial(result) {
    const failure = state(result);
    if (failure) return failure;
    if (result.kind !== "complete") return "Polynomial analysis did not return a complete result.";
    const lines = [`Degree: ${result.degree}`];
    const factors = Array.isArray(result.factors) ? result.factors : [];
    if (factors.length)
      lines.push(
        `Factors: ${factors.map((factor) => `${expression(factor.polynomial)}${factor.multiplicity > 1 ? ` (multiplicity ${factor.multiplicity})` : ""}`).join("; ")}`,
      );
    const real = Array.isArray(result.realRoots) ? result.realRoots : [];
    lines.push(`Real roots: ${real.length}`);
    for (const [index, root] of real.entries())
      lines.push(
        `  ${index + 1}. ${root.lower} to ${root.upper}${root.multiplicity > 1 ? ` · multiplicity ${root.multiplicity}` : ""}${root.certified ? " · certified" : ""}`,
      );
    const complex = Array.isArray(result.complexRoots) ? result.complexRoots : [];
    lines.push(`Complex roots: ${complex.length}`);
    for (const [index, root] of complex.entries()) {
      const realPart = Number(root.real).toPrecision(8);
      const imaginary = Number(root.imaginary);
      lines.push(
        `  ${index + 1}. ${realPart}${imaginary ? ` ${imaginary < 0 ? "−" : "+"} ${Math.abs(imaginary).toPrecision(8)}i` : ""}${root.multiplicity > 1 ? ` · multiplicity ${root.multiplicity}` : ""}${root.converged === false ? " · not converged" : ""}`,
      );
    }
    return lines.join("\n");
  }

  function linearSystem(result, variables) {
    const solution = result.solution ?? result;
    if (solution.kind === "unique")
      return variables
        .map((name) => `${name} = ${expression(solution.solution?.[name])}`)
        .join(", ");
    if (solution.kind === "infinite") return "Infinitely many solutions.";
    if (solution.kind === "no-solution") return "No solution; the equations are inconsistent.";
    return state(solution) ?? "No linear-system result was returned.";
  }

  function presentResult(operation, result, variables = []) {
    if (!result || typeof result !== "object") return { text: String(result) };
    if (operation === "solveNonlinearSystem") return { text: nonlinear(result, variables) };
    if (operation === "analyzePolynomial") return { text: polynomial(result) };
    if (operation === "solveSystem") return { text: linearSystem(result, variables) };
    return undefined;
  }

  const api = { presentResult };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ZimResultPresenter = api;
})(globalThis);
