import { DifferentiationRuleDescriptor } from "./types";

export const differentiationRules: readonly DifferentiationRuleDescriptor[] = Object.freeze([
  {
    id: "derivative.constant",
    family: "arithmetic",
    description: "Constants differentiate to zero",
  },
  {
    id: "derivative.variable",
    family: "arithmetic",
    description: "Differentiate the selected variable",
  },
  { id: "derivative.sum", family: "arithmetic", description: "Differentiate sums term by term" },
  { id: "derivative.product", family: "arithmetic", description: "Apply the product rule" },
  { id: "derivative.quotient", family: "arithmetic", description: "Apply the quotient rule" },
  { id: "derivative.power", family: "power", description: "Apply constant or general power rules" },
  {
    id: "derivative.chain",
    family: "elementary-function",
    description: "Apply registered elementary-function chain rules",
  },
]);
