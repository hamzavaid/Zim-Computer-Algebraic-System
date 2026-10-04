interface SerializedExpression {
  readonly kind: string;
  readonly value?: string;
  readonly numerator?: string;
  readonly denominator?: string;
  readonly name?: string;
  readonly operator?: string;
  readonly operand?: SerializedExpression;
  readonly left?: SerializedExpression;
  readonly right?: SerializedExpression;
  readonly args?: readonly SerializedExpression[];
}

interface CalculatorResultPayload {
  readonly kind?: string;
  readonly text?: string;
  readonly latex?: string;
  readonly inputLatex?: string;
  readonly input?: SerializedExpression;
  readonly expression?: SerializedExpression;
  readonly value?: number;
  readonly exact?: boolean;
  readonly reason?: string;
}

interface CalculatorPayload {
  readonly status: string;
  readonly result?: CalculatorResultPayload;
  readonly error?: { readonly code: string; readonly message: string };
}

interface CalculatorHistoryEntry {
  readonly expression: string;
  readonly result: string;
  readonly latex: string;
  readonly input?: SerializedExpression;
  readonly resultExpression?: SerializedExpression;
  readonly mode: "exact" | "decimal";
  readonly angleUnit: "radians" | "degrees";
  readonly answer: string | number;
}

{
  const historyKey = "zim-calculator-history-v1";
  const mathNamespace = "http://www.w3.org/1998/Math/MathML";

  const element = <T extends HTMLElement>(id: string): T => {
    const value = document.getElementById(id);
    if (!value) throw new Error(`Missing calculator element '${id}'`);
    return value as T;
  };

  const mathElement = (name: string, text?: string): MathMLElement => {
    const value = document.createElementNS(mathNamespace, name) as MathMLElement;
    if (text !== undefined) value.textContent = text;
    return value;
  };

  const display = element<HTMLInputElement>("calculator-display");
  const preview = element<HTMLButtonElement>("calculator-expression-preview");
  const expressionMath = element<HTMLElement>("calculator-expression-math");
  const mode = element<HTMLSelectElement>("calculator-mode");
  const angle = element<HTMLSelectElement>("calculator-angle");
  const precision = element<HTMLInputElement>("calculator-precision");
  const result = element<HTMLOutputElement>("calculator-result");
  const latex = element<HTMLElement>("calculator-latex");
  const error = element<HTMLElement>("calculator-error");
  const calculatorStatus = element<HTMLElement>("calculator-status");
  const historyOutput = element<HTMLOListElement>("calculator-history");
  const historyEmpty = element<HTMLElement>("calculator-history-empty");

  function readHistory(): CalculatorHistoryEntry[] {
    try {
      const saved = JSON.parse(localStorage.getItem(historyKey) ?? "[]") as unknown;
      if (!Array.isArray(saved)) return [];
      return saved
        .filter(
          (entry): entry is CalculatorHistoryEntry =>
            typeof entry === "object" &&
            entry !== null &&
            typeof (entry as CalculatorHistoryEntry).expression === "string" &&
            typeof (entry as CalculatorHistoryEntry).result === "string" &&
            (typeof (entry as CalculatorHistoryEntry).answer === "string" ||
              typeof (entry as CalculatorHistoryEntry).answer === "number"),
        )
        .slice(0, 50);
    } catch {
      return [];
    }
  }

  let history = readHistory();
  let lastAnswer: string | number | undefined = history[0]?.answer;

  function expressionNode(expression: SerializedExpression): MathMLElement {
    if (expression.kind === "constant") return mathElement("mn", expression.value ?? "0");
    if (expression.kind === "rational") {
      const fraction = mathElement("mfrac");
      fraction.append(
        mathElement("mn", expression.numerator ?? "0"),
        mathElement("mn", expression.denominator ?? "1"),
      );
      return fraction;
    }
    if (expression.kind === "variable") {
      const name =
        expression.name === "pi" ? "π" : expression.name === "tau" ? "τ" : expression.name;
      return mathElement("mi", name ?? "?");
    }
    if (expression.kind === "unary") {
      const row = mathElement("mrow");
      row.append(
        mathElement("mo", expression.operator ?? ""),
        expressionNode(expression.operand ?? { kind: "constant", value: "0" }),
      );
      return row;
    }
    if (expression.kind === "binary") {
      const left = expressionNode(expression.left ?? { kind: "constant", value: "0" });
      const right = expressionNode(expression.right ?? { kind: "constant", value: "0" });
      if (expression.operator === "/") {
        const fraction = mathElement("mfrac");
        fraction.append(left, right);
        return fraction;
      }
      if (expression.operator === "^") {
        const power = mathElement("msup");
        power.append(left, right);
        return power;
      }
      const row = mathElement("mrow");
      const operator =
        expression.operator === "*"
          ? "×"
          : expression.operator === "%"
            ? "mod"
            : expression.operator;
      row.append(left, mathElement("mo", operator ?? ""), right);
      return row;
    }
    const args = expression.args ?? [];
    if (expression.name === "sqrt") {
      const root = mathElement("msqrt");
      root.append(expressionNode(args[0] ?? { kind: "constant", value: "0" }));
      return root;
    }
    if (expression.name === "cbrt") {
      const root = mathElement("mroot");
      root.append(
        expressionNode(args[0] ?? { kind: "constant", value: "0" }),
        mathElement("mn", "3"),
      );
      return root;
    }
    if (expression.name === "factorial") {
      const row = mathElement("mrow");
      row.append(
        expressionNode(args[0] ?? { kind: "constant", value: "0" }),
        mathElement("mo", "!"),
      );
      return row;
    }
    const row = mathElement("mrow");
    if (expression.name === "log10" || expression.name === "logb") {
      const logarithm = mathElement("msub");
      logarithm.append(
        mathElement("mi", "log"),
        expression.name === "log10"
          ? mathElement("mn", "10")
          : expressionNode(args[1] ?? { kind: "constant", value: "?" }),
      );
      row.append(logarithm);
    } else {
      row.append(mathElement("mi", expression.name ?? "?"));
    }
    row.append(mathElement("mo", "("));
    const visibleArgs = expression.name === "logb" ? args.slice(0, 1) : args;
    visibleArgs.forEach((argument, index) => {
      if (index > 0) row.append(mathElement("mo", ","));
      row.append(expressionNode(argument));
    });
    row.append(mathElement("mo", ")"));
    return row;
  }

  function math(expression: SerializedExpression): MathMLElement {
    const output = mathElement("math");
    output.setAttribute("display", "block");
    output.append(expressionNode(expression));
    return output;
  }

  function renderHistory(): void {
    historyOutput.replaceChildren();
    historyEmpty.hidden = history.length > 0;
    for (const entry of history) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `Recall ${entry.expression} = ${entry.result}`);
      const source = document.createElement("span");
      source.className = "calculator-history-expression";
      source.textContent = entry.expression;
      const answer = document.createElement("span");
      answer.className = "calculator-history-result";
      answer.append(document.createTextNode("= "));
      if (entry.resultExpression) answer.append(math(entry.resultExpression));
      else answer.append(document.createTextNode(entry.result));
      button.append(source, answer);
      button.addEventListener("click", () => {
        display.value = entry.expression;
        mode.value = entry.mode;
        angle.value = entry.angleUnit;
        refreshOptions();
        beginEditing();
      });
      item.append(button);
      historyOutput.append(item);
    }
  }

  function remember(entry: CalculatorHistoryEntry): void {
    history = [entry, ...history.filter((saved) => saved.expression !== entry.expression)].slice(
      0,
      50,
    );
    try {
      localStorage.setItem(historyKey, JSON.stringify(history));
    } catch {
      /* History remains available for this page when persistent storage is unavailable. */
    }
    renderHistory();
  }

  function refreshOptions(): void {
    const decimal = mode.value === "decimal";
    document.querySelectorAll<HTMLElement>("[data-decimal-option]").forEach((option) => {
      option.hidden = !decimal;
    });
  }

  function beginEditing(): void {
    preview.hidden = true;
    display.hidden = false;
    display.focus();
  }

  function showPreview(expression?: SerializedExpression): void {
    if (!expression) return;
    expressionMath.replaceChildren(math(expression));
    display.hidden = true;
    preview.hidden = false;
  }

  function insert(value: string): void {
    beginEditing();
    const binaryOperators = new Set([" + ", " - ", " * ", " / ", "^", " mod "]);
    if (!display.value.trim() && binaryOperators.has(value) && lastAnswer !== undefined) {
      display.value = "Ans";
      display.setSelectionRange(display.value.length, display.value.length);
    }
    const start = display.selectionStart ?? display.value.length;
    const end = display.selectionEnd ?? display.value.length;
    display.setRangeText(value, start, end, "end");
    display.focus();
  }

  async function calculateExpression(): Promise<void> {
    const expression = display.value.trim();
    if (!expression) {
      error.textContent = "Enter a calculation.";
      error.hidden = false;
      return;
    }
    calculatorStatus.textContent = "Calculating…";
    error.hidden = true;
    try {
      const response = await fetch("/api/v2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiVersion: "2.0-beta",
          operation: "calculate",
          expression,
          mode: mode.value,
          angleUnit: angle.value,
          precisionDigits: Number(precision.value),
          answer: lastAnswer,
        }),
      });
      const payload = (await response.json()) as CalculatorPayload;
      const output = payload.result;
      if (payload.status !== "ok" || !output) {
        error.textContent =
          payload.error?.message ?? output?.reason ?? "This calculation is not supported.";
        error.hidden = false;
        calculatorStatus.textContent = payload.status;
        return;
      }
      const text = output.text ?? "";
      result.textContent = text;
      latex.textContent = output.latex ?? "No LaTeX output.";
      calculatorStatus.textContent = "Ready";
      lastAnswer = output.exact ? text : (output.value ?? text);
      remember({
        expression,
        result: text,
        latex: output.latex ?? "",
        input: output.input,
        resultExpression: output.exact ? output.expression : undefined,
        mode: mode.value as "exact" | "decimal",
        angleUnit: angle.value as "radians" | "degrees",
        answer: lastAnswer,
      });
      display.blur();
      showPreview(output.input);
    } catch {
      error.textContent = "The calculator could not reach the Zim API.";
      error.hidden = false;
      calculatorStatus.textContent = "Unavailable";
    }
  }

  element<HTMLElement>("calculator-keypad").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button) return;
    if (button.dataset.value !== undefined) insert(button.dataset.value);
    else if (button.dataset.action === "factorial") {
      beginEditing();
      const current = display.value.trim();
      display.value = current
        ? `factorial(${current})`
        : lastAnswer === undefined
          ? "factorial("
          : "factorial(Ans)";
      display.setSelectionRange(display.value.length, display.value.length);
    } else if (button.dataset.action === "clear") {
      beginEditing();
      display.value = "";
      result.textContent = "0";
      latex.textContent = "0";
      error.hidden = true;
    } else if (button.dataset.action === "backspace") {
      beginEditing();
      const end = display.selectionStart ?? display.value.length;
      const start = display.selectionEnd === end ? Math.max(0, end - 1) : end;
      display.setRangeText("", start, display.selectionEnd ?? end, "end");
    } else if (button.dataset.action === "equals") void calculateExpression();
  });

  display.addEventListener("focus", () => {
    preview.hidden = true;
    display.hidden = false;
  });
  display.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void calculateExpression();
    }
  });
  preview.addEventListener("click", beginEditing);
  mode.addEventListener("change", () => {
    refreshOptions();
    beginEditing();
  });
  angle.addEventListener("change", beginEditing);

  element<HTMLButtonElement>("clear-calculator-history").addEventListener("click", () => {
    history = [];
    lastAnswer = undefined;
    try {
      localStorage.removeItem(historyKey);
    } catch {
      /* In-memory history is still cleared when persistent storage is unavailable. */
    }
    renderHistory();
  });

  element<HTMLButtonElement>("calculator-theme").addEventListener("click", (event) => {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    (event.currentTarget as HTMLButtonElement).setAttribute("aria-pressed", String(dark));
  });

  renderHistory();
  refreshOptions();
  display.focus();
}
