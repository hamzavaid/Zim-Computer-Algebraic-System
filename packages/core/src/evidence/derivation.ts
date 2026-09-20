import { SyntaxTree } from "../ast/types";
import { format } from "../format/formatter";
import { solveRelation } from "../solve/relationSolver";

export interface DerivationEvidence {
  readonly kind: string;
  readonly accepted?: readonly string[];
  readonly rejected?: readonly { readonly candidate: string; readonly reason: string }[];
  readonly assumptions?: readonly string[];
  readonly verified?: boolean;
  readonly [key: string]: unknown;
}

export type DerivationRuleId =
  | "solve.input"
  | "solve.transform"
  | "solve.candidate"
  | "solve.verify.accepted"
  | "solve.verify.rejected"
  | "solve.result";

export interface DerivationRuleDescriptor {
  readonly id: DerivationRuleId;
  readonly category: "input" | "transformation" | "candidate" | "verification" | "result";
  readonly titleKey: string;
  readonly explanationKey: string;
}

export interface LocalizedDerivationRule extends DerivationRuleDescriptor {
  readonly locale: "en" | "es";
  readonly title: string;
  readonly explanation: string;
}

export interface DerivationNode {
  readonly id: string;
  readonly ruleId: string;
  readonly children: readonly string[];
  readonly evidence: DerivationEvidence;
}

export interface DerivationGraph {
  readonly kind: "derivation-graph";
  readonly roots: readonly string[];
  readonly nodes: readonly DerivationNode[];
}

export type DerivationValidation =
  { readonly valid: true } | { readonly valid: false; readonly reason: string };

const rules: readonly DerivationRuleDescriptor[] = [
  {
    id: "solve.input",
    category: "input",
    titleKey: "solve.input.title",
    explanationKey: "solve.input.explanation",
  },
  {
    id: "solve.transform",
    category: "transformation",
    titleKey: "solve.transform.title",
    explanationKey: "solve.transform.explanation",
  },
  {
    id: "solve.candidate",
    category: "candidate",
    titleKey: "solve.candidate.title",
    explanationKey: "solve.candidate.explanation",
  },
  {
    id: "solve.verify.accepted",
    category: "verification",
    titleKey: "solve.verify.accepted.title",
    explanationKey: "solve.verify.accepted.explanation",
  },
  {
    id: "solve.verify.rejected",
    category: "verification",
    titleKey: "solve.verify.rejected.title",
    explanationKey: "solve.verify.rejected.explanation",
  },
  {
    id: "solve.result",
    category: "result",
    titleKey: "solve.result.title",
    explanationKey: "solve.result.explanation",
  },
] as const;

const messages = {
  en: {
    "solve.input.title": "Original relation",
    "solve.input.explanation": "Read the relation and preserve its domain restrictions.",
    "solve.transform.title": "Equivalent transformation",
    "solve.transform.explanation": "Transform the relation to generate candidate values.",
    "solve.candidate.title": "Candidate",
    "solve.candidate.explanation":
      "A possible value must still be checked in the original relation.",
    "solve.verify.accepted.title": "Accepted candidate",
    "solve.verify.accepted.explanation":
      "Substitution verifies this candidate in the original relation.",
    "solve.verify.rejected.title": "Rejected candidate",
    "solve.verify.rejected.explanation":
      "Substitution shows that this candidate does not satisfy the original relation.",
    "solve.result.title": "Verified result",
    "solve.result.explanation": "Collect the candidates that passed verification.",
  },
  es: {
    "solve.input.title": "Relación original",
    "solve.input.explanation": "Lee la relación y conserva sus restricciones de dominio.",
    "solve.transform.title": "Transformación equivalente",
    "solve.transform.explanation": "Transforma la relación para generar valores candidatos.",
    "solve.candidate.title": "Candidato",
    "solve.candidate.explanation":
      "Un valor posible todavía debe comprobarse en la relación original.",
    "solve.verify.accepted.title": "Candidato aceptado",
    "solve.verify.accepted.explanation":
      "La sustitución verifica el candidato en la relación original.",
    "solve.verify.rejected.title": "Candidato rechazado",
    "solve.verify.rejected.explanation":
      "La sustitución muestra que el candidato no satisface la relación original.",
    "solve.result.title": "Resultado verificado",
    "solve.result.explanation": "Reúne los candidatos que pasaron la verificación.",
  },
} as const;

export function derivationRuleRegistry(): readonly DerivationRuleDescriptor[] {
  return rules;
}

export function derivationRule(id: string, requestedLocale = "en"): LocalizedDerivationRule {
  const descriptor = rules.find((candidate) => candidate.id === id);
  if (!descriptor) throw new RangeError(`Unknown derivation rule '${id}'`);
  const locale: "en" | "es" = requestedLocale === "es" ? "es" : "en";
  const catalog = messages[locale] as Readonly<Record<string, string>>;
  return {
    ...descriptor,
    locale,
    title: catalog[descriptor.titleKey]!,
    explanation: catalog[descriptor.explanationKey]!,
  };
}

export function buildSolveDerivation(
  tree: SyntaxTree,
  options: { readonly variable: string; readonly maxNodes?: number },
): DerivationGraph {
  const maxNodes = Math.max(1, options.maxNodes ?? 2_000);
  const solved = solveRelation(tree, { variable: options.variable });
  const nodes: DerivationNode[] = [
    {
      id: "step-0",
      ruleId: "solve.input",
      children: [],
      evidence: { kind: "input", relation: format(tree), assumptions: [] },
    },
    {
      id: "step-1",
      ruleId: "solve.transform",
      children: ["step-0"],
      evidence: { kind: "transformation", conditions: solved.conditions },
    },
  ];
  const verificationIds: string[] = [];
  const candidates = [
    ...solved.accepted.map((entry) => ({ ...entry, accepted: true })),
    ...solved.rejected.map((entry) => ({ ...entry, accepted: false })),
  ];
  candidates.forEach((entry, index) => {
    const candidateId = `candidate-${index}`;
    const verificationId = `verification-${index}`;
    nodes.push({
      id: candidateId,
      ruleId: "solve.candidate",
      children: ["step-1"],
      evidence: { kind: "candidate", candidate: format(entry.candidate) },
    });
    nodes.push({
      id: verificationId,
      ruleId: entry.accepted ? "solve.verify.accepted" : "solve.verify.rejected",
      children: [candidateId],
      evidence: {
        kind: "verification",
        candidate: format(entry.candidate),
        reason: entry.reason,
        verified: entry.accepted,
      },
    });
    verificationIds.push(verificationId);
  });
  if (candidates.length === 0) {
    const text = format(tree);
    const legacyResult = solveRelation(tree, { variable: options.variable });
    if (legacyResult.solution.kind === "finite") {
      legacyResult.solution.values.forEach((candidate, index) => {
        const candidateId = `candidate-${index}`;
        const verificationId = `verification-${index}`;
        nodes.push(
          {
            id: candidateId,
            ruleId: "solve.candidate",
            children: ["step-1"],
            evidence: { kind: "candidate", candidate: format(candidate), source: text },
          },
          {
            id: verificationId,
            ruleId: "solve.verify.accepted",
            children: [candidateId],
            evidence: {
              kind: "verification",
              candidate: format(candidate),
              reason: "verified by the solver",
              verified: true,
            },
          },
        );
        verificationIds.push(verificationId);
      });
    }
  }
  nodes.push({
    id: "result-0",
    ruleId: "solve.result",
    children: verificationIds.length > 0 ? verificationIds : ["step-1"],
    evidence: {
      kind: "result",
      accepted: solved.accepted.map((entry) => format(entry.candidate)),
      rejected: solved.rejected.map((entry) => ({
        candidate: format(entry.candidate),
        reason: entry.reason,
      })),
      verified: solved.rejected.length === 0,
    },
  });
  if (nodes.length > maxNodes) {
    return {
      kind: "derivation-graph",
      roots: ["budget-0"],
      nodes: [
        {
          id: "budget-0",
          ruleId: "solve.result",
          children: [],
          evidence: { kind: "budget", truncated: true, requestedNodes: nodes.length },
        },
      ],
    };
  }
  return { kind: "derivation-graph", roots: ["result-0"], nodes };
}

export type DerivationRenderMode = "concise" | "classroom" | "diagnostic";

export interface RenderedDerivation {
  readonly mode: DerivationRenderMode;
  readonly locale: "en" | "es";
  readonly lines: readonly string[];
  readonly text: string;
}

export function renderDerivation(
  graph: DerivationGraph,
  options: { readonly mode: DerivationRenderMode; readonly locale?: string },
): RenderedDerivation {
  const locale: "en" | "es" = options.locale === "es" ? "es" : "en";
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const lines: string[] = [];
  const renderNode = (id: string, depth: number): void => {
    const node = nodes.get(id);
    if (!node) return;
    const metadata = derivationRule(node.ruleId, locale);
    const prefix = "  ".repeat(depth);
    if (options.mode === "diagnostic") {
      lines.push(`${prefix}[${node.id}] ${node.ruleId} ${JSON.stringify(node.evidence)}`);
    } else {
      lines.push(`${prefix}${metadata.title}`);
      if (options.mode === "classroom") lines.push(`${prefix}  ${metadata.explanation}`);
    }
    node.children.forEach((child) => renderNode(child, depth + 1));
  };
  if (options.mode === "concise") {
    const root = nodes.get(graph.roots[0]!);
    if (root) lines.push(derivationRule(root.ruleId, locale).title);
  } else graph.roots.forEach((root) => renderNode(root, 0));
  return { mode: options.mode, locale, lines, text: lines.join("\n") };
}

export function validateDerivationGraph(
  graph: DerivationGraph,
  options: { readonly maxNodes: number },
): DerivationValidation {
  if (graph.nodes.length > options.maxNodes) {
    return { valid: false, reason: `Derivation node budget exceeded (${graph.nodes.length})` };
  }
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  if (nodes.size !== graph.nodes.length)
    return { valid: false, reason: "Duplicate node identifier" };
  if (graph.roots.some((root) => !nodes.has(root)))
    return { valid: false, reason: "Unknown root node" };
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    const node = nodes.get(id);
    if (!node || node.children.some((child) => !nodes.has(child))) return false;
    visiting.add(id);
    if (!node.children.every(visit)) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  return graph.roots.every(visit)
    ? { valid: true }
    : { valid: false, reason: "Derivation graph is cyclic or references an unknown child" };
}
