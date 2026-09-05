const TYPES = {
    BINARY_TYPES: {
        ADD: "+",
        SUBTRACT: "-",
        MULTIPLY: "*",
        DIVIDE: "/",
        POWER: "^",
        MODULUS: "%",
    },
    UNARY_TYPES: {
        NEGATE: "-1",
        ABSOLUTE: "|",
        LOGARITHM: "ln",
        EXPONENTIAL: "e",
    },
    NARY_TYPES: {
        ADD: "+",
        MULTIPLY: "*"
    },
    EQUATION_TYPES: {
        EQUALS: "=",
        NOT_EQUALS: "≠",
        GREATER_THAN: ">",
        LESS_THAN: "<",
        GREATER_THAN_OR_EQUAL: "≥",
        LESS_THAN_OR_EQUAL: "≤",
    }
}

module.exports = TYPES