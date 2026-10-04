interface CalculatorPayload {
  readonly status: string;
  readonly result?: { readonly text?: string; readonly latex?: string; readonly reason?: string };
  readonly error?: { readonly code: string; readonly message: string };
}

const element = <T extends HTMLElement>(id: string): T => {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing calculator element '${id}'`);
  return value as T;
};

const display = element<HTMLInputElement>("calculator-display");
const mode = element<HTMLSelectElement>("calculator-mode");
const angle = element<HTMLSelectElement>("calculator-angle");
const precision = element<HTMLInputElement>("calculator-precision");
const result = element<HTMLOutputElement>("calculator-result");
const latex = element<HTMLElement>("calculator-latex");
const error = element<HTMLElement>("calculator-error");
const calculatorStatus = element<HTMLElement>("calculator-status");

function refreshOptions(): void {
  const decimal = mode.value === "decimal";
  document.querySelectorAll<HTMLElement>("[data-decimal-option]").forEach((option) => {
    option.hidden = !decimal;
  });
}

function insert(value: string): void {
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
      }),
    });
    const payload = (await response.json()) as CalculatorPayload;
    if (payload.status !== "ok") {
      error.textContent =
        payload.error?.message ?? payload.result?.reason ?? "This calculation is not supported.";
      error.hidden = false;
      calculatorStatus.textContent = payload.status;
      return;
    }
    result.textContent = payload.result?.text ?? "";
    latex.textContent = payload.result?.latex ?? "No LaTeX output.";
    calculatorStatus.textContent = "Ready";
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
  else if (button.dataset.action === "clear") {
    display.value = "";
    result.textContent = "0";
    latex.textContent = "0";
    error.hidden = true;
    display.focus();
  } else if (button.dataset.action === "backspace") {
    const end = display.selectionStart ?? display.value.length;
    const start = display.selectionEnd === end ? Math.max(0, end - 1) : end;
    display.setRangeText("", start, display.selectionEnd ?? end, "end");
    display.focus();
  } else if (button.dataset.action === "equals") void calculateExpression();
});

display.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void calculateExpression();
  }
});
mode.addEventListener("change", refreshOptions);

element<HTMLButtonElement>("calculator-theme").addEventListener("click", (event) => {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  (event.currentTarget as HTMLButtonElement).setAttribute("aria-pressed", String(dark));
});

display.focus();
refreshOptions();
