export interface AlgebraicRoot {
  readonly kind: "algebraic-root";
  readonly polynomial: string;
  readonly rootIndex: number;
  readonly isolatingInterval?: { readonly lower: string; readonly upper: string };
}

export function algebraicRoot(
  polynomial: string,
  rootIndex: number,
  isolatingInterval?: { readonly lower: string; readonly upper: string },
): AlgebraicRoot {
  if (!Number.isInteger(rootIndex) || rootIndex < 0)
    throw new RangeError("Root index must be nonnegative");
  return {
    kind: "algebraic-root",
    polynomial,
    rootIndex,
    ...(isolatingInterval ? { isolatingInterval } : {}),
  };
}
