type Operation =
  | "parse"
  | "simplify"
  | "solve"
  | "solveSystem"
  | "format"
  | "latex"
  | "capabilities"
  | "analyzePolynomial"
  | "solveRelation"
  | "solveNonlinearSystem"
  | "derive";
declare const ZimResultPresenter: {
  presentResult: (
    operation: string,
    result: unknown,
    variables: readonly string[],
  ) => { text: string } | undefined;
};
interface ApiV2Payload {
  readonly apiVersion: string;
  readonly requestId: string;
  readonly status: string;
  readonly result?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
  readonly diagnostics: unknown;
  readonly timing: { readonly totalMs: number };
}
const API_TO_GUI = Object.freeze({
  parse: "Parse",
  simplify: "Simplify",
  solve: "Solve",
  solveSystem: "Linear System",
  format: "Format",
  latex: "LaTeX",
  capabilities: "Capabilities",
  analyzePolynomial: "Polynomial Analysis",
  solveRelation: "Relation",
  solveNonlinearSystem: "Nonlinear System",
  derive: "Derivation",
});
void API_TO_GUI;
const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing GUI element '${id}'`);
  return element as T;
};
const expressionInput = byId<HTMLTextAreaElement>("expression-input");
const operationInput = byId<HTMLSelectElement>("operation-input");
const operationExample = byId<HTMLElement>("operation-example");
const variableInput = byId<HTMLInputElement>("variable-input");
const variablesInput = byId<HTMLInputElement>("variables-input");
const domainInput = byId<HTMLSelectElement>("domain-input");
const modeInput = byId<HTMLSelectElement>("mode-input");
const initialGuessInput = byId<HTMLInputElement>("initial-guess-input");
const maxIterationsInput = byId<HTMLInputElement>("max-iterations-input");
const toleranceInput = byId<HTMLInputElement>("tolerance-input");
const maxResultantDegreeInput = byId<HTMLInputElement>("max-resultant-degree-input");
const renderModeInput = byId<HTMLSelectElement>("render-mode-input");
const localeInput = byId<HTMLInputElement>("locale-input");
const maxDerivationNodesInput = byId<HTMLInputElement>("max-derivation-nodes-input");
const resultOutput = byId<HTMLOutputElement>("result-output");
const mathOutput = byId<HTMLElement>("math-output");
const latexOutput = byId<HTMLElement>("latex-output");
const errorOutput = byId<HTMLElement>("error-output");
const stepsOutput = byId<HTMLOListElement>("steps-output");
const treeOutput = byId<HTMLElement>("tree-output");
const historyOutput = byId<HTMLUListElement>("history-output");
const statusOutput = byId<HTMLElement>("status-output");
const cancelButton = byId<HTMLButtonElement>("cancel-button");
const rawRequestOutput = byId<HTMLTextAreaElement>("raw-request-output");
const rawResponseOutput = byId<HTMLElement>("raw-response-output");
const resultJsonOutput = byId<HTMLElement>("result-json-output");
const showResultJson = byId<HTMLInputElement>("show-result-json");
const optionFields = [variableInput, variablesInput, modeInput, initialGuessInput, renderModeInput];
const examples: Record<Operation, string> = {
  parse: "sqrt(x + 1) = x - 1",
  simplify: "1 * (2 + 3)",
  solve: "x^2 = 4",
  solveSystem: "x + y = 5; x - y = 1",
  format: "(x + 1) * (x - 1)",
  latex: "x^2 = 4",
  capabilities: "No expression needed",
  analyzePolynomial: "x^3 - 2",
  solveRelation: "5 <= x - 2",
  solveNonlinearSystem: "x * y = 2; x + y = 3",
  derive: "sqrt(x + 1) = x - 1",
};
function refreshOperation(): void {
  const operation = operationInput.value as Operation;
  expressionInput.placeholder =
    operation === "capabilities" ? "No expression needed" : `Try: ${examples[operation]}`;
  operationExample.textContent = `Example: ${examples[operation]}`;
  expressionInput.hidden = operation === "capabilities";
  const expressionLabel = document.querySelector<HTMLLabelElement>('label[for="expression-input"]');
  if (expressionLabel) expressionLabel.hidden = operation === "capabilities";
  for (const field of optionFields) {
    const visible =
      field === variableInput
        ? ["solve", "solveRelation", "analyzePolynomial", "derive"].includes(operation)
        : field === variablesInput
          ? ["solveSystem", "solveNonlinearSystem"].includes(operation)
          : field === modeInput
            ? operation === "solveNonlinearSystem"
            : field === initialGuessInput
              ? operation === "solveNonlinearSystem" && modeInput.value === "numeric"
              : operation === "derive";
    field.hidden = !visible;
    const label = document.querySelector<HTMLLabelElement>(`label[for="${field.id}"]`);
    if (label) label.hidden = !visible;
  }
}
function refreshDeveloperPanels(): void {
  for (const [checkbox, panel] of [
    ["show-api-panel", ".raw-panel"],
    ["show-steps-panel", ".steps"],
    ["show-tree-panel", ".tree-panel"],
  ] as const) {
    const input = byId<HTMLInputElement>(checkbox);
    const section = document.querySelector<HTMLElement>(panel);
    if (section) section.hidden = !input.checked;
  }
}
let activeRequest: AbortController | undefined,
  lastPayload: ApiV2Payload | undefined,
  lastRequest: Record<string, unknown> | undefined,
  lastText = "",
  lastLatex = "",
  requestSequence = 0;
const mathNamespace = "http://www.w3.org/1998/Math/MathML";
const mathElement = (name: string, text?: string): MathMLElement => {
  const element = document.createElementNS(mathNamespace, name) as MathMLElement;
  if (text !== undefined) element.textContent = text;
  return element;
};
function serializedExpression(value: unknown): MathMLElement {
  if (!value || typeof value !== "object") return mathElement("mtext", String(value));
  const item = value as Record<string, unknown>;
  if (item.kind === "constant") return mathElement("mn", String(item.value));
  if (item.kind === "variable") return mathElement("mi", String(item.name));
  if (item.kind === "rational") {
    const node = mathElement("mfrac");
    node.append(
      mathElement("mn", String(item.numerator)),
      mathElement("mn", String(item.denominator)),
    );
    return node;
  }
  if (item.kind === "binary" || item.kind === "equation" || item.kind === "relation") {
    const row = mathElement("mrow");
    row.append(
      serializedExpression(item.left),
      mathElement("mo", String(item.operator ?? "=")),
      serializedExpression(item.right),
    );
    return row;
  }
  if (item.kind === "unary") {
    const row = mathElement("mrow");
    row.append(mathElement("mo", String(item.operator)), serializedExpression(item.operand));
    return row;
  }
  if (item.kind === "function") {
    const args = Array.isArray(item.args) ? item.args : [];
    if (item.name === "sqrt" && args.length === 1) {
      const root = mathElement("msqrt");
      root.append(serializedExpression(args[0]));
      return root;
    }
    const row = mathElement("mrow");
    row.append(mathElement("mi", String(item.name)), mathElement("mo", "("));
    args.forEach((argument, index) => {
      if (index) row.append(mathElement("mo", ","));
      row.append(serializedExpression(argument));
    });
    row.append(mathElement("mo", ")"));
    return row;
  }
  return mathElement("mtext", expressionInput.value.trim());
}
interface StoredHistory {
  readonly version: 1;
  readonly entries: readonly {
    readonly expression: string;
    readonly operation?: Operation;
    readonly createdAt?: string;
  }[];
}
const emptyHistory = (): StoredHistory => ({ version: 1, entries: [] });
function readHistory(): StoredHistory {
  try {
    const value = JSON.parse(localStorage.getItem("zim-history") ?? "null") as unknown;
    if (Array.isArray(value))
      return {
        version: 1,
        entries: value
          .filter((x): x is string => typeof x === "string")
          .map((expression) => ({ expression })),
      };
    if (value && typeof value === "object" && (value as StoredHistory).version === 1)
      return value as StoredHistory;
  } catch {
    /* optional storage */
  }
  return emptyHistory();
}
function renderHistory(): void {
  historyOutput.replaceChildren();
  for (const entry of readHistory().entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = entry.expression;
    button.addEventListener("click", () => {
      expressionInput.value = entry.expression;
      if (entry.operation) {
        operationInput.value = entry.operation;
        refreshOperation();
      }
    });
    const item = document.createElement("li");
    item.append(button);
    historyOutput.append(item);
  }
}
function remember(expression: string, operation: Operation): void {
  if (!expression) return;
  const state: StoredHistory = {
    version: 1,
    entries: [
      { expression, operation, createdAt: new Date().toISOString() },
      ...readHistory().entries.filter((x) => x.expression !== expression),
    ].slice(0, 20),
  };
  try {
    localStorage.setItem("zim-history", JSON.stringify(state));
  } catch {
    /* optional storage */
  }
  renderHistory();
}
function treeNode(value: unknown, label = "root"): HTMLElement {
  const item = document.createElement("li");
  if (value === null || typeof value !== "object") {
    item.textContent = `${label}: ${String(value)}`;
    return item;
  }
  const details = document.createElement("details");
  details.open = label === "root";
  const summary = document.createElement("summary");
  summary.textContent = label;
  details.append(summary);
  const list = document.createElement("ul");
  for (const [key, child] of Object.entries(value)) list.append(treeNode(child, key));
  details.append(list);
  item.append(details);
  return item;
}
function renderTree(value: unknown): void {
  treeOutput.replaceChildren();
  const list = document.createElement("ul");
  list.className = "tree";
  list.append(treeNode(value));
  treeOutput.append(list);
}
function renderSteps(steps: unknown): void {
  stepsOutput.replaceChildren();
  if (!Array.isArray(steps)) return;
  for (const step of steps) {
    const item = document.createElement("li");
    const record = step as Record<string, unknown>;
    item.textContent = String(record.rule ?? "transformation");
    stepsOutput.append(item);
  }
}
function renderDerivationGraph(value: unknown): void {
  stepsOutput.replaceChildren();
  if (!value || typeof value !== "object") return;
  const graph = value as { roots?: string[]; nodes?: Record<string, unknown>[] };
  const nodes = new Map((graph.nodes ?? []).map((node) => [String(node.id), node]));
  const rendered = new Set<string>();
  const render = (id: string): HTMLLIElement => {
    const item = document.createElement("li"),
      node = nodes.get(id);
    if (rendered.has(id)) {
      item.textContent = `See derivation step ${id}`;
      return item;
    }
    if (!node) {
      item.textContent = id;
      return item;
    }
    rendered.add(id);
    const details = document.createElement("details");
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = String(node.ruleId);
    const evidence = document.createElement("pre");
    evidence.textContent = JSON.stringify(node.evidence ?? {}, null, 2);
    details.append(summary, evidence);
    const children = document.createElement("ol");
    for (const child of (node.children as string[]) ?? []) children.append(render(child));
    if (children.childElementCount) details.append(children);
    item.append(details);
    return item;
  };
  for (const root of graph.roots ?? []) stepsOutput.append(render(root));
}
function optionalNumber(input: HTMLInputElement): number | undefined {
  const value = input.value.trim();
  return value ? Number(value) : undefined;
}
function initialGuess(): Record<string, number> | undefined {
  if (!initialGuessInput.value.trim()) return undefined;
  return Object.fromEntries(
    initialGuessInput.value.split(",").map((part) => {
      const [name, value] = part.split("=");
      if (!name || value === undefined || !Number.isFinite(Number(value)))
        throw new Error("Initial guess must use x=1,y=2");
      return [name.trim(), Number(value)];
    }),
  );
}
function buildRequest(operation: Operation): Record<string, unknown> {
  const expression = expressionInput.value.trim(),
    base = { apiVersion: "2.0-beta", requestId: `gui-${Date.now().toString(36)}` };
  if (operation === "capabilities") return { ...base, operation };
  if (!expression) throw new Error("Enter an expression or equation");
  if (operation === "solveSystem")
    return {
      ...base,
      operation,
      expressions: expression
        .split(/[;\n]/u)
        .map((x) => x.trim())
        .filter(Boolean),
      variables: variablesInput.value
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    };
  if (operation === "solveRelation")
    return {
      ...base,
      operation,
      relation: expression,
      variable: variableInput.value.trim() || "x",
    };
  if (operation === "analyzePolynomial")
    return { ...base, operation, expression, variable: variableInput.value.trim() || "x" };
  if (operation === "solveNonlinearSystem")
    return {
      ...base,
      operation,
      equations: expression
        .split(/[;\n]/u)
        .map((x) => x.trim())
        .filter(Boolean),
      variables: variablesInput.value
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      mode: modeInput.value,
      initialGuess: initialGuess(),
      maxIterations: optionalNumber(maxIterationsInput),
      tolerance: optionalNumber(toleranceInput),
      maxResultantDegree: optionalNumber(maxResultantDegreeInput),
    };
  if (operation === "derive")
    return {
      ...base,
      operation,
      expression,
      variable: variableInput.value.trim() || "x",
      renderMode: renderModeInput.value,
      locale: localeInput.value.trim() || undefined,
      budget:
        optionalNumber(maxDerivationNodesInput) === undefined
          ? undefined
          : { maxDerivationNodes: optionalNumber(maxDerivationNodesInput) },
    };
  return {
    ...base,
    operation,
    expression,
    ...(operation === "solve"
      ? {
          variable: variableInput.value.trim() || "x",
          domain: domainInput.value,
          includeSteps: true,
        }
      : {}),
    ...(operation === "simplify" ? { includeSteps: true } : {}),
  };
}
function expressionText(value: unknown): string {
  if (value === "-infinity") return "−∞";
  if (value === "infinity") return "∞";
  if (!value || typeof value !== "object") return String(value);
  const expression = value as Record<string, unknown>;
  if (expression.kind === "constant") return String(expression.value);
  if (expression.kind === "rational") return `${expression.numerator}/${expression.denominator}`;
  if (expression.kind === "variable") return String(expression.name);
  return JSON.stringify(value);
}
function solutionText(value: unknown, variable: string): string {
  if (!value || typeof value !== "object") return String(value);
  const set = value as Record<string, unknown>;
  if (set.kind === "empty") return "∅";
  if (set.kind === "universal") return `${variable} ∈ ${String(set.domain)}`;
  if (set.kind === "finite")
    return `${variable} ∈ {${(set.values as unknown[]).map(expressionText).join(", ")}}`;
  if (set.kind === "interval") {
    const lower =
      set.lower === "-infinity"
        ? ""
        : `${expressionText(set.lower)} ${set.lowerInclusive ? "≤" : "<"} `;
    const upper =
      set.upper === "infinity"
        ? ""
        : ` ${set.upperInclusive ? "≤" : "<"} ${expressionText(set.upper)}`;
    return `${lower}${variable}${upper}`;
  }
  if (set.kind === "union")
    return (set.sets as unknown[]).map((part) => solutionText(part, variable)).join(" ∪ ");
  if (set.kind === "conditional")
    return `${solutionText(set.set, variable)} if ${(set.conditions as string[]).join(" and ")}`;
  if (set.kind === "parameterized")
    return `${expressionText(set.expression)}, ${String(set.parameter)} ∈ ℤ`;
  return JSON.stringify(value);
}
function resultText(result: unknown): string {
  if (!result || typeof result !== "object") return String(result);
  const item = result as Record<string, unknown>;
  const operation = String(lastRequest?.operation ?? "");
  const variables = Array.isArray(lastRequest?.variables)
    ? lastRequest.variables.filter((value): value is string => typeof value === "string")
    : [];
  const pretty = ZimResultPresenter.presentResult(operation, result, variables);
  if (pretty) return pretty.text;
  if (lastRequest?.operation === "capabilities") {
    const limits = item.limits as Record<string, number>;
    const experimental = item.experimental as Record<string, boolean>;
    return [
      `Release ${item.release}`,
      `API versions: ${(item.apiVersions as string[]).join(", ")}`,
      `Operations: ${(item.operations as string[]).join(", ")}`,
      `Solver families: ${(item.solverFamilies as string[]).join(", ")}`,
      `Domains: ${(item.domains as string[]).join(", ")}`,
      `Limits: ${Object.entries(limits)
        .map(([name, value]) => `${name} ${value}`)
        .join(", ")}`,
      `Experimental: ${
        Object.entries(experimental)
          .filter(([, enabled]) => enabled)
          .map(([name]) => name)
          .join(", ") || "none"
      }`,
    ].join("\n");
  }
  if (item.solution && lastRequest?.operation === "solveRelation")
    return solutionText(item.solution, String(lastRequest.variable ?? "x"));
  if (typeof item.text === "string") return item.text;
  if (typeof item.latex === "string" && Object.keys(item).length === 1) return item.latex;
  if (
    item.rendered &&
    typeof item.rendered === "object" &&
    typeof (item.rendered as Record<string, unknown>).text === "string"
  )
    return String((item.rendered as Record<string, unknown>).text);
  return JSON.stringify(result, null, 2);
}
function showPayload(payload: ApiV2Payload): void {
  lastPayload = payload;
  rawResponseOutput.textContent = JSON.stringify(payload, null, 2);
  statusOutput.textContent = payload.status === "ok" ? "Ready" : payload.status;
  if (payload.status !== "ok") {
    errorOutput.textContent = `${payload.error?.code ?? payload.status}: ${payload.error?.message ?? "Operation did not complete"}`;
    errorOutput.hidden = false;
    lastText = "";
    lastLatex = "";
    resultOutput.textContent = "";
    mathOutput.replaceChildren();
    latexOutput.textContent = "";
    stepsOutput.replaceChildren();
    treeOutput.replaceChildren();
    resultJsonOutput.textContent = "";
    resultJsonOutput.hidden = true;
    return;
  }
  errorOutput.hidden = true;
  lastText = resultText(payload.result);
  resultOutput.textContent = lastText;
  resultJsonOutput.textContent = JSON.stringify(payload.result, null, 2);
  resultJsonOutput.hidden = !showResultJson.checked;
  const result = payload.result as Record<string, unknown> | undefined;
  lastLatex = typeof result?.latex === "string" ? result.latex : "";
  latexOutput.textContent = lastLatex || "No LaTeX output for this operation.";
  const longResult = lastText.length > 120 || lastText.includes("\n");
  mathOutput.classList.toggle("long-result", longResult);
  if (longResult) {
    const prose = document.createElement("pre");
    prose.className = "result-prose";
    prose.textContent = lastText;
    mathOutput.replaceChildren(prose);
  } else {
    const math = mathElement("math");
    math.setAttribute("display", "block");
    math.append(
      result?.ast && lastRequest?.operation === "parse"
        ? serializedExpression(result.ast)
        : mathElement("mtext", lastText),
    );
    mathOutput.replaceChildren(math);
  }
  if (result?.graph) renderDerivationGraph(result.graph);
  else if (result?.derivation) renderDerivationGraph(result.derivation);
  else if (result) renderSteps(result.steps);
  renderTree(payload.result);
}
async function submit(request: Record<string, unknown>): Promise<void> {
  lastRequest = request;
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const sequence = ++requestSequence;
  cancelButton.disabled = false;
  statusOutput.textContent = "Working…";
  rawRequestOutput.value = JSON.stringify(request, null, 2);
  try {
    const response = await fetch("/api/v2", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    const payload = (await response.json()) as ApiV2Payload;
    if (sequence === requestSequence) showPayload(payload);
    if (sequence === requestSequence && payload.status === "ok" && !lastLatex) {
      const expression =
        typeof request.expression === "string"
          ? request.expression
          : typeof request.relation === "string"
            ? request.relation
            : undefined;
      if (expression) {
        const latexResponse = await fetch("/api/v2", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ apiVersion: "2.0-beta", operation: "latex", expression }),
          signal: controller.signal,
        });
        const latexPayload = (await latexResponse.json()) as ApiV2Payload;
        const latex = (latexPayload.result as Record<string, unknown> | undefined)?.latex;
        if (sequence === requestSequence && typeof latex === "string") {
          lastLatex = latex;
          latexOutput.textContent = latex;
        }
      }
    }
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError")
      statusOutput.textContent = "Cancelled";
    else {
      errorOutput.textContent =
        caught instanceof Error ? caught.message : "The local Zim backend is unavailable";
      errorOutput.hidden = false;
    }
  } finally {
    if (sequence === requestSequence) {
      activeRequest = undefined;
      cancelButton.disabled = true;
    }
  }
}
async function run(operation: Operation): Promise<void> {
  try {
    if (operation === "solve" && /(?:!=|<=|>=|<|>|≠|≤|≥)/u.test(expressionInput.value))
      operation = "solveRelation";
    const request = buildRequest(operation);
    await submit(request);
    remember(expressionInput.value.trim(), operation);
  } catch (caught) {
    errorOutput.textContent =
      caught instanceof Error ? `INPUT_REQUIRED: ${caught.message}` : "Invalid input";
    errorOutput.hidden = false;
  }
}
operationInput.addEventListener("change", refreshOperation);
modeInput.addEventListener("change", refreshOperation);
document
  .querySelectorAll<HTMLInputElement>('#settings-panel input[type="checkbox"]')
  .forEach((input) => input.addEventListener("change", refreshDeveloperPanels));
showResultJson.addEventListener("change", () => {
  resultJsonOutput.hidden = !showResultJson.checked || !lastPayload?.result;
});
byId<HTMLButtonElement>("run-button").addEventListener(
  "click",
  () => void run(operationInput.value as Operation),
);
byId<HTMLButtonElement>("run-raw-button").addEventListener("click", () => {
  try {
    void submit(JSON.parse(rawRequestOutput.value) as Record<string, unknown>);
  } catch {
    errorOutput.textContent = "INVALID_JSON: Raw request must be valid JSON";
    errorOutput.hidden = false;
  }
});
cancelButton.addEventListener("click", () => activeRequest?.abort());
byId<HTMLButtonElement>("clear-button").addEventListener("click", () => {
  expressionInput.value = "";
  resultOutput.textContent = "";
  mathOutput.replaceChildren();
  latexOutput.textContent = "";
  rawResponseOutput.textContent = "";
  resultJsonOutput.textContent = "";
  resultJsonOutput.hidden = true;
  errorOutput.hidden = true;
  stepsOutput.replaceChildren();
  treeOutput.replaceChildren();
});
byId<HTMLButtonElement>("clear-history-button").addEventListener("click", () => {
  try {
    localStorage.setItem("zim-history", JSON.stringify(emptyHistory()));
  } catch {
    /* optional */
  }
  renderHistory();
});
document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) =>
  button.addEventListener("click", () => {
    const value =
      button.dataset.copy === "text"
        ? lastText
        : button.dataset.copy === "latex"
          ? lastLatex
          : lastPayload?.result
            ? JSON.stringify(lastPayload.result, null, 2)
            : "";
    if (value) void navigator.clipboard.writeText(value);
  }),
);
byId<HTMLButtonElement>("theme-toggle").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
});
expressionInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    void run("solve");
  }
});
rawRequestOutput.value = JSON.stringify(
  { apiVersion: "2.0-beta", operation: "capabilities" },
  null,
  2,
);
renderHistory();
refreshOperation();
refreshDeveloperPanels();
