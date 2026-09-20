export interface DerivationEvidence {
  readonly kind: string;
  readonly accepted?: readonly string[];
  readonly rejected?: readonly { readonly candidate: string; readonly reason: string }[];
  readonly assumptions?: readonly string[];
  readonly verified?: boolean;
  readonly [key: string]: unknown;
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
