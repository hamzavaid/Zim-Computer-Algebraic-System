const BinaryOp = require('./BinaryOp');
const Symbol = require('./Symbol')
const { EQUATION_TYPES, BINARY_TYPES, UNARY_TYPES, NARY_TYPES } = require('../types/Types');
const Constant = require('../types/leafs/Constant');
const UnaryOp = require('./UnaryOp');
const { ADD, SUBTRACT, MULTIPLY, DIVIDE, POWER, MODULUS } = BINARY_TYPES;
const { NEGATE, LOGARITHM, EXPONENTIAL, ABSOLUTE } = UNARY_TYPES;

class Equation extends BinaryOp {
    /**
     * Equation structure for representing equations.
     * Such as equals, not equals, greater than, less than, etc.
     * @param {Symbol} left
     * @param {Symbol} right
     * @param {EQUATION_TYPES} type
     */
    constructor(left, right, type = '=') {
        super(left, right, type);
    }

    solveFor(variable) {
        if (!this.left || !this.right) {
            throw new Error("Both sides of the equation must be set");
        }

        let nl = this.left.simplify();
        let nr = this.right.simplify();

        if (this.right.checkName("Polynomial")) nr = this.right.expression;
        if (this.left.checkName("Polynomial")) nl = this.left.expression;

        let leftbool = this.#containsVariable(nl, variable);
        let rightbool = this.#containsVariable(nr, variable);

        let mainBranch, otherBranch;

        if (leftbool) {
            mainBranch = nl;
            otherBranch = nr;
        } else if (rightbool) {
            mainBranch = nr;
            otherBranch = nl;
        } else if (this.astEqual(nr, nl)) {
            return "Any value satisfies the equation";
        } else {
            return "Variable not found in equation"
        }

        if (mainBranch.checkName("Variable") && mainBranch.value === variable) {
            // If the opposite side still contains the variable, move it over
            if (this.#containsVariable(otherBranch, variable)) {
                const newLeft = new BinaryOp(mainBranch, otherBranch, SUBTRACT).simplify();
                return new Equation(newLeft, new Constant(0)).solveFor(variable);
            }
            return otherBranch;
        }

        switch (mainBranch.type) {
            case ADD: {
                const varOnLeft = this.#containsVariable(mainBranch.left, variable);
                const varBranch = varOnLeft ? mainBranch.left : mainBranch.right;
                const constBranch = varOnLeft ? mainBranch.right : mainBranch.left;
                const newRight = new BinaryOp(otherBranch, constBranch, SUBTRACT).simplify()
                const result = new Equation(varBranch, newRight).solveFor(variable);
                return Array.isArray(result) ? result.flat() : result;
            }
            case SUBTRACT: {
                const varOnLeft = this.#containsVariable(mainBranch.left, variable);
                if (varOnLeft) {
                    const newRight = new BinaryOp(otherBranch, mainBranch.right, ADD).simplify();
                    return new Equation(mainBranch.left, newRight).solveFor(variable);
                } else {
                    const newRight = new BinaryOp(mainBranch.left, otherBranch, SUBTRACT).simplify();
                    return new Equation(mainBranch.right, newRight).solveFor(variable);
                }
            }
            case MULTIPLY: {
                const varOnLeft = this.#containsVariable(mainBranch.left, variable);
                const varBranch = varOnLeft ? mainBranch.left : mainBranch.right;
                const constBranch = varOnLeft ? mainBranch.right : mainBranch.left;
                const newRight = new BinaryOp(otherBranch, constBranch, DIVIDE).simplify();
                const result = new Equation(varBranch, newRight).solveFor(variable);
                return Array.isArray(result) ? result.flat() : result;
            }
            case DIVIDE: {
                const varOnLeft = this.#containsVariable(mainBranch.left, variable);
                if (varOnLeft) {
                    const newRight = new BinaryOp(otherBranch, mainBranch.right, MULTIPLY).simplify();
                    const result = new Equation(mainBranch.left, newRight).solveFor(variable);
                    return Array.isArray(result) ? result.flat() : result;
                } else {
                    const newRight = new BinaryOp(mainBranch.left, otherBranch, DIVIDE).simplify();
                    const result = new Equation(mainBranch.right, newRight).solveFor(variable);
                    return Array.isArray(result) ? result.flat() : result;
                }
            }
            case POWER: {
                const varInBase = this.#containsVariable(mainBranch.left, variable);
                if (varInBase) {
                    const reciprocal = new BinaryOp(new Constant(1), mainBranch.right, DIVIDE).simplify();
                    const newRight = new BinaryOp(otherBranch, reciprocal, POWER).simplify();
                    if (mainBranch.right.checkName("Constant") &&
                        Number.isInteger(mainBranch.right.value) &&
                        mainBranch.right.value % 2 === 0) {
                        // ± branch
                        const principal = newRight.simplify();
                        return [principal, new BinaryOp(new Constant(-1), principal, MULTIPLY).simplify()];
                    }
                    const result = new Equation(mainBranch.left, newRight).solveFor(variable);
                    return Array.isArray(result) ? result.flat() : result;
                } else {
                    // 2 ^ x = 5 => ln(2 ^ x) = ln(5) => x = ln(5)/ln(2)
                    const newRight = new BinaryOp(
                        new UnaryOp(otherBranch, LOGARITHM),
                        new UnaryOp(mainBranch.left, LOGARITHM),
                        DIVIDE
                    ).simplify();
                    if (mainBranch.right.checkName("Constant") &&
                        Number.isInteger(mainBranch.right.value) &&
                        mainBranch.right.value % 2 === 0) {
                        // ± branch
                        const principal = newRight.simplify();
                        return [principal, new BinaryOp(new Constant(-1), principal, MULTIPLY).simplify()];
                    }
                    const result = new Equation(mainBranch.right, newRight).solveFor(variable);
                    return Array.isArray(result) ? result.flat() : result;
                }
            }
            case MODULUS: { throw new Error(`Not Implemented Yet`); }
            case NEGATE: {
                const newRight = new UnaryOp(otherBranch, NEGATE);
                const result = new Equation(mainBranch.operand, newRight).solveFor(variable)
                return Array.isArray(result) ? result.flat() : result;
            }
            case ABSOLUTE: {
                const newRight = new UnaryOp(otherBranch, ABSOLUTE);
                const result = new Equation(mainBranch.operand, newRight).solveFor(variable)
                return Array.isArray(result) ? result.flat() : result;
            }
            case LOGARITHM: {
                const newRight = new UnaryOp(otherBranch, EXPONENTIAL).simplify();
                const result = new Equation(mainBranch.operand, newRight).solveFor(variable);
                return Array.isArray(result) ? result.flat() : result;
            }
            case EXPONENTIAL: {
                const newRight = new UnaryOp(otherBranch, LOGARITHM).simplify();
                const result = new Equation(mainBranch.operand, newRight).solveFor(variable);
                return Array.isArray(result) ? result.flat() : result;
            }
            default: throw new Error(`Unsupported operation: ${mainBranch.constructor.name}`);
        }

    }

    eval(variable, value) {
        // TODO
    }

    simplify() {
        this.right = this.right.simplify();
        this.left = this.left.simplify();
        return this;
        // TODO
    }

    /**
     * @param {Symbol} expr 
     * @param {String} variable 
     * @returns {Boolean}
     */
    #containsVariable(expr, variable) {
        if (expr.checkName("Variable"))
            return expr.value === variable;
        if (expr.checkName("Constant"))
            return false;
        if (expr.checkName("UnaryOp"))
            return this.#containsVariable(expr.operand, variable);
        if (expr.checkName("BinaryOp"))
            return this.#containsVariable(expr.left, variable) || this.#containsVariable(expr.right, variable);
        if (expr.checkName("Polynomial"))
            return expr.variable === variable;
        return false;
    }

    astEqual(a, b) {
        if (a === b) return true;

        // 1. Null / mismatched constructors not equal
        if (!a || !b || a.constructor !== b.constructor) return false;

        // 2. Per‑class comparisons
        switch (a.constructor.name) {
            case 'Constant':
                return a.value === b.value;

            case 'Variable':
                return a.value === b.value;

            case 'UnaryOp':
                return a.type === b.type &&
                    this.astEqual(a.operand, b.operand);

            case 'BinaryOp':
                return a.type === b.type &&
                    this.astEqual(a.left, b.left) &&
                    this.astEqual(a.right, b.right);

            case 'NAryOp':
                if (a.type !== b.type || a.arr.length !== b.arr.length) return false;
                for (let i = 0; i < a.arr.length; ++i) {
                    if (!this.astEqual(a.arr[i], b.arr[i])) return false;
                }
                return true;

            case 'Polynomial':
                return a.variable === b.variable &&
                    this.astEqual(a.expression, b.expression);

            default:
                return false;
        }
    }

    toString() {
        return `${this.left.toString()} ${this.type} ${this.right.toString()}`
    }
}

module.exports = Equation;