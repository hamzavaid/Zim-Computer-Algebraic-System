#!/usr/bin/env node
import * as readline from "node:readline";
import {
  format,
  formatSolveResult,
  parse,
  serializeSyntaxTree,
  simplify,
  solve,
  solveSystem,
  formatSystemSolveResult,
  toLatex,
  ZimError,
} from "@zim/core";

export interface CliIo {
  readonly log: (message: string) => void;
  readonly error: (message: string) => void;
}

const usage = `Usage:
  zim parse <expression>
  zim simplify [--trace] <expression>
  zim solve --variable <name> [--domain real|complex] <equation>
  zim system --variables <name,...> <equation; equation; ...>
  zim latex <expression-or-equation>
  zim repl`;

interface ParsedArguments {
  readonly command?: string;
  readonly expression: string;
  readonly variable?: string;
  readonly variables?: readonly string[];
  readonly domain?: "real" | "complex";
  readonly trace: boolean;
}

function parseArguments(args: readonly string[]): ParsedArguments {
  const command = args[0];
  const expressionParts: string[] = [];
  let variableName: string | undefined;
  let variableNames: string[] | undefined;
  let domain: "real" | "complex" | undefined;
  let trace = false;
  for (let index = 1; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === "--trace") trace = true;
    else if (argument === "--variable" || argument === "-v") {
      variableName = args[++index];
      if (!variableName) throw new Error(`${argument} requires a variable name`);
    } else if (argument === "--variables") {
      const value = args[++index];
      if (!value) throw new Error("--variables requires a comma-separated variable list");
      variableNames = value.split(",").filter((name) => name.length > 0);
    } else if (argument === "--domain") {
      const value = args[++index];
      if (value !== "real" && value !== "complex") {
        throw new Error("--domain must be 'real' or 'complex'");
      }
      domain = value;
    } else expressionParts.push(argument);
  }
  return {
    command,
    expression: expressionParts.join(" ").trim(),
    variable: variableName,
    variables: variableNames,
    domain,
    trace,
  };
}

export function runCommand(args: readonly string[], io: CliIo = console): number {
  try {
    const options = parseArguments(args);
    if (!options.command || options.command === "help" || options.command === "--help") {
      io.log(usage);
      return options.command ? 0 : 2;
    }
    if (options.command === "repl") {
      io.error("The repl command is only available from the executable entrypoint");
      return 2;
    }
    if (!options.expression) {
      io.error(`An expression is required.\n${usage}`);
      return 2;
    }
    if (options.command === "system") {
      if (!options.variables?.length) {
        io.error("The system command requires --variables <name,...>");
        return 2;
      }
      const sources = options.expression
        .split(";")
        .map((source) => source.trim())
        .filter(Boolean);
      const trees = sources.map(parse);
      if (trees.some((tree) => tree.kind !== "equation")) {
        io.error("Every system member must be an equation");
        return 2;
      }
      const result = solveSystem(
        trees.filter((tree) => tree.kind === "equation"),
        options.variables,
      );
      io.log(formatSystemSolveResult(result));
      return result.kind === "unsupported" ? 3 : 0;
    }
    const tree = parse(options.expression);
    if (options.command === "parse") {
      io.log(JSON.stringify(serializeSyntaxTree(tree), null, 2));
      return 0;
    }
    if (options.command === "simplify") {
      const result = simplify(tree, { debug: options.trace });
      if (options.trace) {
        for (const step of result.steps) {
          io.log(`[${step.rule}] ${format(step.before)} -> ${format(step.after)}`);
        }
      }
      io.log(format(result.expression));
      return 0;
    }
    if (options.command === "solve") {
      if (!options.variable) {
        io.error("The solve command requires --variable <name>");
        return 2;
      }
      const result = solve(tree, { variable: options.variable, domain: options.domain });
      io.log(formatSolveResult(result));
      return result.kind === "unsupported" ? 3 : 0;
    }
    if (options.command === "latex") {
      io.log(toLatex(tree));
      return 0;
    }
    io.error(`Unknown command '${options.command}'.\n${usage}`);
    return 2;
  } catch (error) {
    if (error instanceof ZimError) {
      io.error(`${error.code}: ${error.message}`);
      return 2;
    }
    io.error(error instanceof Error ? error.message : "Unknown CLI failure");
    return 2;
  }
}

function startRepl(): void {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  terminal.setPrompt("zim> ");
  console.log("Zim 2 REPL. Enter a CLI command, or 'exit'.");
  terminal.prompt();
  terminal.on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed === "exit" || trimmed === "quit") return terminal.close();
    if (trimmed) process.exitCode = runCommand(trimmed.split(/\s+/u));
    terminal.prompt();
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "repl") startRepl();
  else process.exitCode = runCommand(args);
}
