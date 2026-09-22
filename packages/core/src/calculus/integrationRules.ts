import { IntegrationRuleDescriptor } from "./types";

export const integrationRules: readonly IntegrationRuleDescriptor[] = Object.freeze([
  {
    id: "integral.constant",
    family: "linearity",
    description: "Integrate constants with respect to the selected variable",
  },
  { id: "integral.sum", family: "linearity", description: "Integrate sums term by term" },
  {
    id: "integral.constant-multiple",
    family: "linearity",
    description: "Extract factors independent of the integration variable",
  },
  {
    id: "integral.power",
    family: "power",
    description: "Integrate integer powers, with a logarithmic rule for reciprocal powers",
  },
  {
    id: "integral.exp",
    family: "elementary-function",
    description: "Integrate exponentials with a verified linear inner derivative",
  },
  {
    id: "integral.trigonometric",
    family: "elementary-function",
    description: "Integrate sine and cosine with a verified linear inner derivative",
  },
  {
    id: "integral.log",
    family: "elementary-function",
    description: "Integrate the natural logarithm on its positive real domain",
  },
]);
