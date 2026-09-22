#!/usr/bin/env node
import * as readline from "node:readline";
import { API_VERSION_V2, ApiV2Request, executeV2, parse, ZimError } from "@zim/core";

export interface CliIo {
  readonly log: (message: string) => void;
  readonly error: (message: string) => void;
}
export const API_TO_CLI = Object.freeze({
  parse: "parse",
  simplify: "simplify",
  solve: "solve",
  solveSystem: "system",
  format: "format",
  latex: "latex",
  capabilities: "capabilities",
  analyzePolynomial: "polynomial",
  solveRelation: "solve/relation",
  solveNonlinearSystem: "nonlinear",
  derive: "derive",
});
const commandHelp: Readonly<Record<string, string>> = {
  parse: "zim parse [--json] <expression>",
  simplify: "zim simplify [--trace] [--json] <expression>",
  solve:
    "zim solve --variable, -v <name> [--domain real|complex] [--json|--latex] <equation-or-relation>",
  system: "zim system --variables <name,...> [--json] <equation; equation; ...>",
  relation: "zim relation --variable, -v <name> [--json] <relation>",
  polynomial: "zim polynomial --variable, -v <name> [--json] <expression>",
  nonlinear:
    "zim nonlinear --variables <name,...> [--mode exact|numeric] [--initial-guess x=1,y=2] [--max-iterations <n>] [--tolerance <number>] [--max-resultant-degree <n>] [--json] <equations>",
  derive:
    "zim derive --variable, -v <name> [--render-mode concise|classroom|diagnostic] [--locale <locale>] [--max-derivation-nodes <n>] [--json] <equation>",
  format: "zim format <expression>",
  latex: "zim latex <expression-or-equation>",
  capabilities: "zim capabilities [--json]",
  repl: "zim repl",
};
const usage = `Usage:\n  ${Object.values(commandHelp).join("\n  ")}`;
interface ParsedArguments {
  readonly command?: string;
  readonly expression: string;
  readonly variable?: string;
  readonly variables?: readonly string[];
  readonly domain?: "real" | "complex";
  readonly trace: boolean;
  readonly json: boolean;
  readonly latex: boolean;
  readonly mode?: "exact" | "numeric";
  readonly initialGuess?: Readonly<Record<string, number>>;
  readonly maxIterations?: number;
  readonly tolerance?: number;
  readonly maxResultantDegree?: number;
  readonly renderMode?: "concise" | "classroom" | "diagnostic";
  readonly locale?: string;
  readonly maxDerivationNodes?: number;
  readonly help: boolean;
}
function positiveNumber(value: string | undefined, flag: string, integer = false): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || (integer && !Number.isInteger(parsed)))
    throw new Error(`${flag} requires a positive ${integer ? "integer" : "number"}`);
  return parsed;
}
function parseInitialGuess(value: string | undefined): Readonly<Record<string, number>> {
  if (!value) throw new Error("--initial-guess requires assignments such as x=1,y=2");
  const result: Record<string, number> = {};
  for (const assignment of value.split(",")) {
    const match = /^([A-Za-z_]\w*)=(-?(?:\d+(?:\.\d*)?|\.\d+))$/u.exec(assignment.trim());
    if (!match) throw new Error("Invalid initial guess; use x=1,y=2");
    result[match[1]!] = Number(match[2]);
  }
  return result;
}
function parseArguments(args: readonly string[]): ParsedArguments {
  const command = args[0];
  const expressionParts: string[] = [];
  let variable: string | undefined,
    variables: string[] | undefined,
    domain: "real" | "complex" | undefined;
  let mode: "exact" | "numeric" | undefined,
    initialGuess: Readonly<Record<string, number>> | undefined;
  let maxIterations: number | undefined,
    tolerance: number | undefined,
    maxResultantDegree: number | undefined;
  let renderMode: "concise" | "classroom" | "diagnostic" | undefined,
    locale: string | undefined,
    maxDerivationNodes: number | undefined;
  let trace = false,
    json = false,
    latex = false,
    help = false;
  for (let index = 1; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === "--trace") trace = true;
    else if (argument === "--json") json = true;
    else if (argument === "--text") json = latex = false;
    else if (argument === "--latex") latex = true;
    else if (argument === "--help" || argument === "-h") help = true;
    else if (argument === "--variable" || argument === "-v") {
      variable = args[++index];
      if (!variable) throw new Error(`${argument} requires a variable name`);
    } else if (argument === "--variables") {
      const value = args[++index];
      if (!value) throw new Error("--variables requires a comma-separated variable list");
      variables = value
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
    } else if (argument === "--domain") {
      const value = args[++index];
      if (value !== "real" && value !== "complex")
        throw new Error("--domain must be 'real' or 'complex'");
      domain = value;
    } else if (argument === "--mode") {
      const value = args[++index];
      if (value !== "exact" && value !== "numeric")
        throw new Error("--mode must be 'exact' or 'numeric'");
      mode = value;
    } else if (argument === "--initial-guess") initialGuess = parseInitialGuess(args[++index]);
    else if (argument === "--max-iterations")
      maxIterations = positiveNumber(args[++index], argument, true);
    else if (argument === "--tolerance") tolerance = positiveNumber(args[++index], argument);
    else if (argument === "--max-resultant-degree")
      maxResultantDegree = positiveNumber(args[++index], argument, true);
    else if (argument === "--render-mode") {
      const value = args[++index];
      if (value !== "concise" && value !== "classroom" && value !== "diagnostic")
        throw new Error("--render-mode must be concise, classroom, or diagnostic");
      renderMode = value;
    } else if (argument === "--locale") {
      locale = args[++index];
      if (!locale) throw new Error("--locale requires a locale");
    } else if (argument === "--max-derivation-nodes")
      maxDerivationNodes = positiveNumber(args[++index], argument, true);
    else if (/^--[A-Za-z]/u.test(argument)) throw new Error(`Unknown option '${argument}'`);
    else expressionParts.push(argument);
  }
  return {
    command,
    expression: expressionParts.join(" ").trim(),
    variable,
    variables,
    domain,
    trace,
    json,
    latex,
    mode,
    initialGuess,
    maxIterations,
    tolerance,
    maxResultantDegree,
    renderMode,
    locale,
    maxDerivationNodes,
    help,
  };
}
function splitEquations(source: string): string[] {
  return source
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}
function expressionText(value: unknown): string {
  if (value === "-infinity") return "-∞";
  if (value === "infinity") return "∞";
  if (!value || typeof value !== "object") return String(value);
  const node = value as Record<string, unknown>;
  if (node.kind === "constant") return String(node.value);
  if (node.kind === "rational") return `${node.numerator}/${node.denominator}`;
  if (node.kind === "variable") return String(node.name);
  if (node.kind === "unary") return `${node.operator}${expressionText(node.operand)}`;
  if (node.kind === "binary" || node.kind === "equation" || node.kind === "relation")
    return `${expressionText(node.left)} ${node.operator ?? "="} ${expressionText(node.right)}`;
  if (node.kind === "function")
    return `${node.name}(${(node.args as unknown[]).map(expressionText).join(", ")})`;
  return JSON.stringify(value);
}
function setText(set: unknown): string {
  if (!set || typeof set !== "object") return String(set);
  const value = set as Record<string, unknown>;
  if (value.kind === "empty") return "∅";
  if (value.kind === "universal") return String(value.domain);
  if (value.kind === "finite")
    return `{${(value.values as unknown[]).map(expressionText).join(", ")}}`;
  if (value.kind === "interval")
    return `${value.lowerInclusive ? "[" : "("}${expressionText(value.lower)}, ${expressionText(value.upper)}${value.upperInclusive ? "]" : ")"}`;
  if (value.kind === "union") return (value.sets as unknown[]).map(setText).join(" ∪ ");
  if (value.kind === "conditional")
    return `${setText(value.set)} if ${(value.conditions as string[]).join(" and ")}`;
  if (value.kind === "parameterized")
    return `{${value.variable} = ${expressionText(value.expression)} | ${value.parameter} ∈ ℤ}`;
  return JSON.stringify(set);
}
function humanResult(operation: string, result: unknown): string {
  if (!result || typeof result !== "object") return String(result);
  const value = result as Record<string, unknown>;
  if (typeof value.text === "string") return value.text;
  if (operation === "latex" && typeof value.latex === "string") return value.latex;
  if (operation === "solveRelation") return `${value.variable ?? "x"} ∈ ${setText(value.solution)}`;
  if (operation === "derive")
    return String(
      (value.rendered as Record<string, unknown>)?.text ?? JSON.stringify(value, null, 2),
    );
  if (operation === "capabilities")
    return [
      `Release: ${value.release}`,
      `API versions: ${(value.apiVersions as string[]).join(", ")}`,
      `Operations: ${(value.operations as string[]).join(", ")}`,
      `Solver families: ${(value.solverFamilies as string[]).join(", ")}`,
      `Domains: ${(value.domains as string[]).join(", ")}`,
      `Limits: ${JSON.stringify(value.limits)}`,
      `Experimental: ${JSON.stringify(value.experimental)}`,
    ].join("\n");
  if (operation === "analyzePolynomial")
    return [
      `Status: ${value.kind}`,
      `Degree: ${value.degree}`,
      `Factors: ${JSON.stringify(value.factors)}`,
      `Real roots: ${JSON.stringify(value.realRoots)}`,
      `Complex roots: ${JSON.stringify(value.complexRoots)}`,
    ].join("\n");
  if (operation === "solveNonlinearSystem")
    return `Status: ${value.kind}\n${JSON.stringify(value, null, 2)}`;
  return JSON.stringify(value, null, 2);
}
function requestFor(options: ParsedArguments): ApiV2Request {
  const base = { apiVersion: API_VERSION_V2 } as const;
  switch (options.command) {
    case "capabilities":
      return { ...base, operation: "capabilities" };
    case "parse":
    case "format":
    case "latex":
      return { ...base, operation: options.command, expression: options.expression };
    case "simplify":
      return {
        ...base,
        operation: "simplify",
        expression: options.expression,
        includeSteps: options.trace,
      };
    case "solve": {
      if (!options.variable) throw new Error("The solve command requires --variable <name>");
      let tree;
      try {
        tree = parse(options.expression);
      } catch (caught) {
        if (!(caught instanceof ZimError) || !options.json) throw caught;
        return {
          ...base,
          operation: "solve",
          expression: options.expression,
          variable: options.variable,
          domain: options.domain,
          includeSteps: true,
        };
      }
      return tree.kind === "relation"
        ? {
            ...base,
            operation: "solveRelation",
            relation: options.expression,
            variable: options.variable,
          }
        : {
            ...base,
            operation: "solve",
            expression: options.expression,
            variable: options.variable,
            domain: options.domain,
            includeSteps: true,
          };
    }
    case "relation":
      if (!options.variable) throw new Error("The relation command requires --variable <name>");
      else
        return {
          ...base,
          operation: "solveRelation",
          relation: options.expression,
          variable: options.variable,
        };
    case "polynomial":
      if (!options.variable) throw new Error("The polynomial command requires --variable <name>");
      else
        return {
          ...base,
          operation: "analyzePolynomial",
          expression: options.expression,
          variable: options.variable,
        };
    case "system":
      if (!options.variables?.length)
        throw new Error("The system command requires --variables <name,...>");
      else
        return {
          ...base,
          operation: "solveSystem",
          expressions: splitEquations(options.expression),
          variables: options.variables,
        };
    case "nonlinear":
      if (!options.variables?.length)
        throw new Error("The nonlinear command requires --variables <name,...>");
      else
        return {
          ...base,
          operation: "solveNonlinearSystem",
          equations: splitEquations(options.expression),
          variables: options.variables,
          mode: options.mode,
          initialGuess: options.initialGuess,
          maxIterations: options.maxIterations,
          tolerance: options.tolerance,
          maxResultantDegree: options.maxResultantDegree,
        };
    case "derive":
      if (!options.variable) throw new Error("The derive command requires --variable <name>");
      else
        return {
          ...base,
          operation: "derive",
          expression: options.expression,
          variable: options.variable,
          renderMode: options.renderMode,
          locale: options.locale,
          budget:
            options.maxDerivationNodes === undefined
              ? undefined
              : { maxDerivationNodes: options.maxDerivationNodes },
        };
    default:
      throw new Error(`Unknown command '${options.command}'.\n${usage}`);
  }
}
export function runCommand(args: readonly string[], io: CliIo = console): number {
  try {
    const options = parseArguments(args);
    if (!options.command || options.command === "help" || options.command === "--help") {
      io.log(usage);
      return options.command ? 0 : 2;
    }
    if (options.help) {
      io.log(commandHelp[options.command] ?? usage);
      return commandHelp[options.command] ? 0 : 2;
    }
    if (options.command === "repl") {
      io.error("The repl command is only available from the executable entrypoint");
      return 2;
    }
    if (options.command !== "capabilities" && !options.expression)
      throw new Error("An expression is required");
    const request = requestFor(options);
    const response = executeV2(request);
    if (response.status !== "ok") {
      if (options.json) io.log(JSON.stringify(response, null, 2));
      else
        io.error(
          `${response.error?.code ?? response.status}: ${response.error?.message ?? "Operation did not complete"}`,
        );
    } else if (options.json) io.log(JSON.stringify(response, null, 2));
    else if (options.command === "parse")
      io.log(JSON.stringify((response.result as Record<string, unknown>).ast, null, 2));
    else {
      const result = response.result as Record<string, unknown>;
      if (options.trace && Array.isArray(result.steps))
        for (const step of result.steps as Record<string, unknown>[]) io.log(`[${step.rule}]`);
      io.log(
        options.latex && typeof result.latex === "string"
          ? result.latex
          : humanResult(request.operation, result),
      );
    }
    return response.status === "ok"
      ? 0
      : response.status === "unsupported" || response.status === "budget-exceeded"
        ? 3
        : 2;
  } catch (error) {
    if (error instanceof ZimError) io.error(`${error.code}: ${error.message}`);
    else io.error(error instanceof Error ? error.message : "Unknown CLI failure");
    return 2;
  }
}
export function tokenizeReplLine(line: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (const character of line.trim()) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") escaped = true;
    else if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
    } else if (character === '"' || character === "'") quote = character;
    else if (/\s/u.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else current += character;
  }
  if (escaped) current += "\\";
  if (quote) throw new Error("Unterminated quoted expression");
  if (current) tokens.push(current);
  return tokens;
}

function startRepl(): void {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  terminal.setPrompt("zim> ");
  console.log("Zim 2 REPL. Enter a CLI command, or 'exit'.");
  terminal.prompt();
  terminal.on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed === "exit" || trimmed === "quit") return terminal.close();
    if (trimmed) {
      try {
        process.exitCode = runCommand(tokenizeReplLine(trimmed));
      } catch (caught) {
        console.error(caught instanceof Error ? caught.message : "Invalid REPL input");
        process.exitCode = 2;
      }
    }
    terminal.prompt();
  });
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "repl") startRepl();
  else process.exitCode = runCommand(args);
}
