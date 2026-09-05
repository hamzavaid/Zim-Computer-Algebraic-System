const Symbol = require('./Symbol');
const Constant = require(`../types/leafs/Constant`)
const { UNARY_TYPES } = require('../types/Types');

const { NEGATE, ABSOLUTE, LOGARITHM, EXPONENTIAL } = UNARY_TYPES;

class UnaryOp extends Symbol {
    /**
     * Structure for unary operations.
     * such as logerithm, negation, etc.
     * @param {Symbol} operand 
     * @param {UNARY_TYPES} type 
     */
    constructor(operand, type) {
        super();
        this.type = type;
        if (operand.checkName("UnaryOp") && operand.type == NEGATE) {
            if ((type == NEGATE)) {
                return operand.operand;
            } else if (type == ABSOLUTE) return new UnaryOp(operand.operand, ABSOLUTE);
        } else if (operand.checkName("Constant")) {
            if (operand.value == 0) return operand;
            if (operand.value < 0) return new Constant(Math.abs(operand.value));
        }

        this.operand = operand.simplify();
    }

    eval(variable, value) {
        switch (this.type) {
            case NEGATE:
                return -this.operand.eval(variable, value);
            case ABSOLUTE:
                return Math.abs(this.operand.eval(variable, value));
            case LOGARITHM:
                const operandEval = this.operand.eval(variable, value);
                if (operandEval <= 0) {
                    throw new Error('Logarithm of non-positive number');
                }
                return Math.log(operandEval);
            case EXPONENTIAL:
                return Math.exp(this.operand.eval(variable, value));
            default:
                throw new Error(`Unknown unary operation type: ${this.type}`);
        }
    }

    simplify() {
        return this;
        // TODO
    }

    toString() {
        switch (this.type) {
            case NEGATE:
                return `-${this.operand.toString()}`;
            case ABSOLUTE:
                return `|${this.operand.toString()}|`;
            case LOGARITHM:
                return `log(${this.operand.toString()})`;
            case EXPONENTIAL:
                return `e^(${this.operand.toString()})`;
            default:
                return `${this.type}(${this.operand.toString()})`;
        }
    }
}

module.exports = UnaryOp;