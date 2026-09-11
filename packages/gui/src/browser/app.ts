interface ApiErrorPayload {
  readonly version: string;
  readonly status: "error";
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly start?: number;
    readonly end?: number;
  };
}

interface ApiSuccessPayload {
  readonly version: string;
  readonly status: "ok";
  readonly result: Record<string, unknown>;
}

type ApiPayload = ApiErrorPayload | ApiSuccessPayload;
type Operation = "parse" | "simplify" | "solve";

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing GUI element '${id}'`);
  return element as T;
};

const expressionInput = byId<HTMLTextAreaElement>("expression-input");
const variableInput = byId<HTMLInputElement>("variable-input");
const domainInput = byId<HTMLSelectElement>("domain-input");
const resultOutput = byId<HTMLOutputElement>("result-output");
const mathOutput = byId<HTMLElement>("math-output");
const latexOutput = byId<HTMLElement>("latex-output");
const errorOutput = byId<HTMLElement>("error-output");
const stepsOutput = byId<HTMLOListElement>("steps-output");
const treeOutput = byId<HTMLElement>("tree-output");
const historyOutput = byId<HTMLUListElement>("history-output");
const statusOutput = byId<HTMLElement>("status-output");
const themeButton = byId<HTMLButtonElement>("theme-toggle");

let lastPayload: ApiPayload | undefined;
let lastText = "";
let lastLatex = "";

const mathNamespace = "http://www.w3.org/1998/Math/MathML";

function mathElement(name: string, text?: string): MathMLElement {
  const element = document.createElementNS(mathNamespace, name) as MathMLElement;
  if (text !== undefined) element.textContent = text;
  return element;
}

function serializedExpression(value: unknown): MathMLElement {
  if (!value || typeof value !== "object") return mathElement("mtext", String(value));
  const expression = value as Record<string, unknown>;
  const kind = expression.kind;
  if (kind === "constant") return mathElement("mn", String(expression.value));
  if (kind === "rational") {
    const fraction = mathElement("mfrac");
    fraction.append(
      mathElement("mn", String(expression.numerator)),
      mathElement("mn", String(expression.denominator)),
    );
    return fraction;
  }
  if (kind === "variable") return mathElement("mi", String(expression.name));
  if (kind === "unary") {
    const row = mathElement("mrow");
    row.append(
      mathElement("mo", String(expression.operator)),
      serializedExpression(expression.operand),
    );
    return row;
  }
  if (kind === "equation") {
    const row = mathElement("mrow");
    row.append(
      serializedExpression(expression.left),
      mathElement("mo", "="),
      serializedExpression(expression.right),
    );
    return row;
  }
  if (kind === "binary") {
    if (expression.operator === "/") {
      const fraction = mathElement("mfrac");
      fraction.append(
        serializedExpression(expression.left),
        serializedExpression(expression.right),
      );
      return fraction;
    }
    if (expression.operator === "^") {
      const power = mathElement("msup");
      power.append(serializedExpression(expression.left), serializedExpression(expression.right));
      return power;
    }
    const row = mathElement("mrow");
    const operator = expression.operator === "*" ? "·" : String(expression.operator);
    row.append(
      serializedExpression(expression.left),
      mathElement("mo", operator),
      serializedExpression(expression.right),
    );
    return row;
  }
  if (kind === "function") {
    const args = Array.isArray(expression.args) ? expression.args : [];
    if (expression.name === "sqrt" && args.length === 1) {
      const root = mathElement("msqrt");
      root.append(serializedExpression(args[0]));
      return root;
    }
    const row = mathElement("mrow");
    row.append(mathElement("mi", String(expression.name)), mathElement("mo", "("));
    args.forEach((argument, index) => {
      if (index > 0) row.append(mathElement("mo", ","));
      row.append(serializedExpression(argument));
    });
    row.append(mathElement("mo", ")"));
    return row;
  }
  return mathElement("mtext", "Result");
}

function renderMathematics(result: Record<string, unknown>): void {
  const math = mathElement("math");
  math.setAttribute("display", "block");
  if (result.ast) math.append(serializedExpression(result.ast));
  else if (result.solution && typeof result.solution === "object") {
    const solution = result.solution as Record<string, unknown>;
    if (solution.kind === "solution") {
      const row = mathElement("mrow");
      row.append(
        mathElement("mi", String(solution.variable)),
        mathElement("mo", "="),
        serializedExpression(solution.value),
      );
      math.append(row);
    } else if (solution.kind === "multiple-solutions") {
      const row = mathElement("mrow");
      row.append(
        mathElement("mi", String(solution.variable)),
        mathElement("mo", "∈"),
        mathElement("mo", "{"),
      );
      const values = Array.isArray(solution.values) ? solution.values : [];
      values.forEach((value, index) => {
        if (index > 0) row.append(mathElement("mo", ","));
        row.append(serializedExpression(value));
      });
      row.append(mathElement("mo", "}"));
      math.append(row);
    } else math.append(mathElement("mtext", lastText));
  } else math.append(mathElement("mtext", lastText));
  mathOutput.replaceChildren(math);
}

function readHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem("zim-history") ?? "[]") as string[];
  } catch {
    return [];
  }
}

function renderHistory(): void {
  historyOutput.replaceChildren();
  for (const expression of readHistory()) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = expression;
    button.addEventListener("click", () => {
      expressionInput.value = expression;
      expressionInput.focus();
    });
    const item = document.createElement("li");
    item.append(button);
    historyOutput.append(item);
  }
}

function remember(expression: string): void {
  const history = [expression, ...readHistory().filter((item) => item !== expression)].slice(0, 20);
  try {
    localStorage.setItem("zim-history", JSON.stringify(history));
  } catch {
    // A private browser context may disable storage; solving still works.
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
  const children = document.createElement("ul");
  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const [key, child] of entries) children.append(treeNode(child, String(key)));
  details.append(children);
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
  if (!Array.isArray(steps) || steps.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No transformation steps were returned by the backend.";
    stepsOutput.append(item);
    return;
  }
  for (const step of steps) {
    const item = document.createElement("li");
    const record = step as Record<string, unknown>;
    const title = document.createElement("strong");
    title.textContent = String(record.rule ?? "transformation");
    const code = document.createElement("pre");
    code.textContent = JSON.stringify(record.after, null, 2);
    item.append(title, code);
    stepsOutput.append(item);
  }
}

function showError(payload: ApiErrorPayload): void {
  const position =
    payload.error.start === undefined
      ? ""
      : ` (characters ${payload.error.start}-${payload.error.end ?? payload.error.start})`;
  errorOutput.textContent = `${payload.error.code}: ${payload.error.message}${position}`;
  errorOutput.hidden = false;
  resultOutput.textContent = "";
  mathOutput.replaceChildren();
  latexOutput.textContent = "";
  stepsOutput.replaceChildren();
  treeOutput.replaceChildren();
}

function showSuccess(payload: ApiSuccessPayload): void {
  const result = payload.result;
  lastText = typeof result.text === "string" ? result.text : "Completed";
  lastLatex = typeof result.latex === "string" ? result.latex : "";
  resultOutput.textContent = lastText;
  renderMathematics(result);
  latexOutput.textContent = lastLatex || "No LaTeX output for this operation.";
  errorOutput.hidden = true;
  renderSteps(result.steps);
  renderTree(result.ast ?? result.solution ?? result);
}

async function run(operation: Operation): Promise<void> {
  const expression = expressionInput.value.trim();
  if (!expression) {
    showError({
      version: "1.0",
      status: "error",
      error: { code: "INPUT_REQUIRED", message: "Enter an expression or equation" },
    });
    return;
  }
  if (expression.length > 4096) {
    showError({
      version: "1.0",
      status: "error",
      error: { code: "INPUT_TOO_LARGE", message: "Expression must be 4096 characters or fewer" },
    });
    return;
  }
  statusOutput.textContent = "Working…";
  const request = {
    version: "1.0",
    operation,
    expression,
    variable: operation === "solve" ? variableInput.value.trim() || "x" : undefined,
    domain: operation === "solve" ? domainInput.value : undefined,
    includeSteps: true,
  };
  try {
    const response = await fetch("/api/v1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    lastPayload = (await response.json()) as ApiPayload;
    if (lastPayload.status === "error") showError(lastPayload);
    else {
      showSuccess(lastPayload);
      remember(expression);
    }
  } catch {
    showError({
      version: "1.0",
      status: "error",
      error: { code: "CONNECTION_ERROR", message: "The local Zim backend is unavailable" },
    });
  } finally {
    statusOutput.textContent = "Ready";
  }
}

async function copy(value: string, label: string): Promise<void> {
  if (!value) return;
  await navigator.clipboard.writeText(value);
  statusOutput.textContent = `${label} copied`;
}

document.querySelectorAll<HTMLButtonElement>("[data-operation]").forEach((button) => {
  button.addEventListener("click", () => void run(button.dataset.operation as Operation));
});

byId<HTMLButtonElement>("clear-button").addEventListener("click", () => {
  expressionInput.value = "";
  resultOutput.textContent = "";
  mathOutput.replaceChildren();
  latexOutput.textContent = "";
  errorOutput.hidden = true;
  stepsOutput.replaceChildren();
  treeOutput.replaceChildren();
  lastPayload = undefined;
  lastText = "";
  lastLatex = "";
  expressionInput.focus();
});

document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => {
  button.addEventListener("click", () => {
    const kind = button.dataset.copy;
    if (kind === "text") void copy(lastText, "Plain text");
    else if (kind === "latex") void copy(lastLatex, "LaTeX");
    else if (kind === "json" && lastPayload) {
      void copy(JSON.stringify(lastPayload, null, 2), "JSON");
    }
  });
});

themeButton.addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  themeButton.setAttribute("aria-pressed", String(dark));
  try {
    localStorage.setItem("zim-theme", dark ? "dark" : "light");
  } catch {
    // Theme persistence is optional.
  }
});

expressionInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    void run("solve");
  }
});

try {
  document.documentElement.dataset.theme = localStorage.getItem("zim-theme") ?? "light";
} catch {
  document.documentElement.dataset.theme = "light";
}
renderHistory();
