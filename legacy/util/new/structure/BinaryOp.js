const Symbol = require('./Symbol');
const Constant = require('../types/leafs/Constant');
const UnaryOp = require('./UnaryOp');
const NaryOp = require(`./NaryOp`);
const Variable = require(`../types/Leafs/Variable`)
const { BINARY_TYPES, UNARY_TYPES } = require('../types/Types');

const { ADD, SUBTRACT, MULTIPLY, DIVIDE, POWER, MODULUS } = BINARY_TYPES;
const { NEGATE, ABSOLUTE, LOGARITHM, EXPONENTIAL } = UNARY_TYPES;

class BinaryOp extends Symbol {
    /**
     * Structure for binary operations.
     * such as addition, subtraction, multiplication, division, etc.
     * @param {Symbol} left 
     * @param {Symbol} right 
     * @param {BINARY_TYPES} type 
     */
    constructor(left, right, type) {
        super();
        this.type = type;
        this.left = left;
        this.right = right;
    }

    eval(variable, value) {
        switch (this.type) {
            case ADD:
                return this.left.eval(variable, value) + this.right.eval(variable, value);
            case SUBTRACT:
                return this.left.eval(variable, value) - this.right.eval(variable, value);
            case MULTIPLY:
                return this.left.eval(variable, value) * this.right.eval(variable, value);
            case DIVIDE:
                const rightEval = this.right.eval(variable, value);
                if (rightEval === 0) {
                    throw new Error('Division by zero');
                }
                return this.left.eval(variable, value) / rightEval;
            case POWER:
                return Math.pow(this.left.eval(variable, value), this.right.eval(variable, value));
            case MODULUS:
                return this.left.eval(variable, value) % this.right.eval(variable, value);
            default:
                throw new Error(`Unknown binary operation type: ${this.type}`);
        }
    }

    simplify() {
        let cur, next = this;
        do {
            cur = next;
            if (cur.checkName("UnaryOp")) return cur;
            next = this.#fold_constants(next);
            if (next.checkName("Constant")) return next;

            next = next._peakFlatten();
            if (next.checkName("Constant")) return next;

            next = this.#identityFold(next);

            next = this.#flatten(next);

        } while (!this.#astEqual(next, cur))

        return next;
    }

    toString() {
        return `(${this.left.toString()} ${this.type == MODULUS ? "mod" : this.type} ${this.right.toString()})`;
    }

    #constValue(node) {
        if (node.checkName("Constant")) return node.value;
        if (node.checkName("UnaryOp")) {
            const v = this.#constValue(node.operand);
            if (v === null) return null;

            switch (node.type) {
                case NEGATE: return -v;
                case ABSOLUTE: return Math.abs(v);
            }
        }
        return null;
    }

    #fold_constants(node) {
        if (node.right.checkName("BinaryOp")) {
            node.right = this.#fold_constants(node.right)
        }

        if (node.left.checkName("BinaryOp")) {
            node.left = this.#fold_constants(node.left)
        }

        const lv = this.#constValue(node.left);
        const rv = this.#constValue(node.right);

        if (lv !== null && rv !== null) {
            switch (node.type) {
                case ADD: return new Constant(lv + rv);
                case SUBTRACT: return new Constant(lv - rv);
                case MULTIPLY: return new Constant(lv * rv);
                case DIVIDE:
                    if (rv === 0) return node;
                    return new Constant(lv / rv);
                case MODULUS:
                    if (rv === 0) return node;
                    return new Constant(lv % rv);
                case POWER: return new Constant(Math.pow(lv, rv));
                default: return node;
            }
        }
        return node;
    }

    /**
     * @returns {Symbol}
     */
    _peakFlatten() {
        const bin = (l, r, t) => new BinaryOp(l, r, t);
        const uni = (op, t) => new UnaryOp(op, t);
        const neg = (op) => uni(op, NEGATE)

        let lv = this.#constValue(this.left);
        let rv = this.#constValue(this.right);

        if (lv == null && rv == null) {
            let nr = this.right;
            let nl = this.left;

            if (this.type == ADD) {
                if (nl?.type == DIVIDE && nr?.type == DIVIDE) {
                    // (a / b) + (c / d) => (ad + cb) / bd
                    let denominator = bin(nl.right, nr.right, MULTIPLY);
                    let lnum = bin(nl.left, nr.right, MULTIPLY);
                    let rnum = bin(nr.left, nl.right, MULTIPLY);
                    let numerator = bin(lnum, rnum, ADD);
                    return bin(numerator, denominator, DIVIDE);
                }
            }

            if (this.right.checkName("BinaryOp")) this.right = this.right._peakFlatten();


            if (this.left.checkName("BinaryOp")) this.left = this.left._peakFlatten();

            return this;

        } // If Both values are not constant, cannot flatten

        lv = lv == null ? this.#flatCheck(this.left) : new Constant(lv);
        rv = rv == null ? this.#flatCheck(this.right) : new Constant(rv);

        if (this.left.checkName("UnaryOp") && this.left.type == NEGATE && this.left.operand.checkName("BinaryOp")) {
            let op = this.left.operand;
            if (op.type == ADD || op.type == SUBTRACT) {
                let nl = op.left.checkName("Constant") ? new Constant(-op.left.value) : neg(op.left);
                lv = bin(nl, op.right, op.type == ADD ? SUBTRACT : ADD);
            }

            if (op.type == MULTIPLY || op.type == DIVIDE) {
                let nl = op.left.checkName("Constant") ? new Constant(-op.left.value) : neg(op.left);
                lv = bin(nl, op.right, op.type)
            }
        }

        if (this.right.checkName("UnaryOp") && this.right.type == NEGATE && this.right.operand.checkName("BinaryOp")) {
            let op = this.right.operand;
            if (op.type == ADD || op.type == SUBTRACT) {
                let nl = op.left.checkName("Constant") ? new Constant(-op.left.value) : neg(op.left);
                rv = bin(nl, op.right, op.type == ADD ? SUBTRACT : ABSOLUTE);
            }

            if (op.type == MULTIPLY || op.type == DIVIDE) {
                let nl = op.left.checkName("Constant") ? new Constant(-op.left.value) : neg(op.left);
                rv = bin(nl, op.right, op.type)
            }
        }

        if (lv !== null && rv !== null) {
            switch (this.type) {
                case ADD: {
                    // 2 + (x + 3) => (x + 5) || 2 + (x - 3) => (x - 1)
                    if (lv.type == ADD || lv.type == SUBTRACT) {
                        // (2 + x) + 5 => (2 + 5) + x => 7 + x || (2 - x) + 5 => (2 + 5) - x => 7 - x
                        if (lv.left.checkName("Constant")) {
                            let nv = lv.left.value + rv.value;
                            if (nv == 0) return (lv.type == SUBTRACT ? neg(lv.right) : lv.right);
                            return bin(new Constant(nv), lv.right, lv.type);
                        }
                        // (x + 2) + 5 => x + (2 + 5) => x + 7 || (x - 2) + 5 => x + (5 - 2) => x + 3
                        if (lv.right.checkName("Constant")) {
                            let nv = lv.type == SUBTRACT ? rv.value - lv.right.value : lv.right.value + rv.value;
                            if (nv == 0) return lv.left;
                            if (nv > 0) return bin(lv.left, new Constant(nv), ADD);
                            if (nv < 0) return bin(lv.left, new Constant(-nv), SUBTRACT);
                        }
                    }

                    if (rv.type == ADD || rv.type == SUBTRACT) {
                        // 5 + (2 + x) => (5 + 2) + x => 7 + x || 5 + (2 - x) => (5 + 2) - x => 7 - x
                        if (rv.left.checkName("Constant")) {
                            let nv = rv.left.value + lv.value;
                            if (nv == 0) return (rv.type == SUBTRACT ? neg(rv.right) : rv.right);
                            return bin(new Constant(nv), rv.right, rv.type)

                        }
                        // 5 + (x + 2) => (5 + 2) + x => 7 + x || 5 + (x - 2) => (5 - 2) + x => 3 + x
                        if (rv.right.checkName("Constant")) {
                            let nv = rv.type == SUBTRACT ? lv.value - rv.right.value : rv.right.value + lv.value;
                            if (nv == 0) return rv.left;
                            if (nv > 0) return bin(rv.left, new Constant(nv), ADD);
                            if (nv < 0) return bin(rv.left, new Constant(-nv), SUBTRACT);
                        }
                    }

                    return this;
                }
                case SUBTRACT: {
                    // 3 - (x + 2) => (-x + 1) || 3 - (x - 3) => (-x + 6)
                    if (lv?.type == ADD || lv?.type == SUBTRACT) {
                        // (2 + x) - 5 => x + (2 - 5) => x - 3 || (2 - x) - 5 => (2 - 5) - x => -x - 3
                        if (lv.left.checkName("Constant")) {
                            let nv = lv.left.value - rv.value;
                            let nr = lv.type == SUBTRACT ? neg(lv.right) : lv.right;
                            if (nv == 0) return nr;
                            if (nv > 0) return bin(new Constant(nv), nr, ADD);
                            if (nv < 0) return bin(nr, new Constant(-nv), SUBTRACT);
                        }
                        // (x + 2) - 5 => x + (2 - 5) => x - 3 || (x - 2) - 5 => x + (-2 - 5) => x - 7
                        if (lv.right.checkName("Constant")) {
                            let nv = lv.type == SUBTRACT ? -lv.right.value - rv.value : lv.right.value - rv.value;
                            if (nv == 0) return lv.left;
                            if (nv > 0) return bin(lv.left, new Constant(nv), ADD);
                            if (nv < 0) return bin(lv.left, new Constant(-nv), SUBTRACT);
                        }
                    }

                    if (rv?.type == ADD || rv?.type == SUBTRACT) {
                        // 5 - (2 + x) => (5 - 2) - x => 3 - x || 5 - (2 - x) => (5 - 2) + x => 3 + x
                        if (rv.left.checkName("Constant")) {
                            let nv = lv.value - rv.left.value;
                            if (nv == 0) return rv.type == SUBTRACT ? rv.right : neg(rv.right);
                            return bin(new Constant(nv), rv.right, rv.type == SUBTRACT ? ADD : SUBTRACT);
                        }
                        // 5 - (x + 2) => (5 - 2) - x => 3 - x || 5 - (x - 2) => (5 + 2) - x => 7 - x
                        if (rv.right.checkName("Constant")) {
                            let nv = rv.type == SUBTRACT ? rv.right.value + lv.value : lv.value - rv.right.value;
                            if (nv == 0) return neg(rv.left);
                            return bin(new Constant(nv), rv.left, SUBTRACT);
                        }
                    }
                    return this;
                }
                case MULTIPLY: {
                    // 3 * (x * 2) => 6 * x || 3 * (x / 3) => x
                    if (lv?.type == MULTIPLY || lv?.type == DIVIDE) {
                        // (3 * x) * 2 => (3 * 2) * x => 6 * x || (3 / x) * 2 => (3 * 2) / x => 6 / x
                        if (lv.left.checkName("Constant")) {
                            let nv = lv.left.value * rv.value;
                            if (nv == 0) return new Constant(0);
                            if (lv.type == MULTIPLY) {
                                if (nv == 1) return lv.right;
                                return bin(new Constant(nv), lv.right, MULTIPLY);
                            } else {
                                return bin(new Constant(nv), lv.right, DIVIDE);
                            }
                        }
                        // (x * 3) * 2 => (3 * 2) * x => 6 * x || (x / 3) * 2 => (2 / 3) * x
                        if (lv.right.checkName("Constant")) {
                            let nv;
                            if (lv.type == MULTIPLY) {
                                nv = lv.right.value * rv.value;
                            } else {
                                if (lv.right.value == 0) throw new Error("Division by Zero");
                                nv = rv.value / lv.right.value;
                            }
                            if (nv == 0) return new Constant(0);
                            if (nv == 1) return lv.left;
                            return bin(new Constant(nv), lv.left, MULTIPLY);
                        }
                    }

                    if (rv?.type == MULTIPLY || rv?.type == DIVIDE) {
                        // 3 * (2 * x) => (3 * 2) * x => 6 * x || 3 * (2 / x) => (3 * 2) / x => 6 / x
                        if (rv.left.checkName("Constant")) {
                            let nv = rv.left.value * lv.value;
                            if (nv == 0) return new Constant(0);
                            if (rv.type == MULTIPLY) {
                                if (nv == 1) return rv.right;
                                return bin(new Constant(nv), rv.right, MULTIPLY);
                            } else {
                                return bin(new Constant(nv), rv.right, DIVIDE);
                            }
                        }
                        // 3 * (x * 2) => (3 * 2) * x => 6 * x || 3 * (x / 2) => (3 / 2) * x
                        if (rv.right.checkName("Constant")) {
                            let nv;
                            if (rv.type == MULTIPLY) {
                                nv = rv.right.value * lv.value;
                            } else {
                                if (rv.right.value == 0) throw new Error("Division by Zero");
                                nv = lv.value / rv.right.value;
                            }
                            if (nv == 0) return new Constant(0);
                            if (nv == 1) return rv.left;
                            return bin(new Constant(nv), rv.left, MULTIPLY);
                        }
                    }

                    if (lv?.type == ADD || lv?.type == SUBTRACT) {
                        // (x + 5) * 3 => (3 * x + 15) || (5 + x) * 3 => (15 + 3 *)
                        if (rv.value == 0) return new Constant(0);
                        let nl = lv.left.checkName("Constant") ? new Constant(lv.left.value * rv.value) : bin(rv, lv.left, MULTIPLY);
                        let nr = lv.right.checkName("Constant") ? new Constant(lv.right.value * rv.value) : bin(rv, lv.right, MULTIPLY);
                        return bin(nl, nr, lv.type);
                    }

                    if (rv?.type == ADD || rv?.type == SUBTRACT) {
                        // 3 * (x + 5) => (3 * x + 15) || 3 * (5 + x) => (15 + 3 * x)
                        if (rv.value == 0) return new Constant(0);
                        let nl = rv.left.checkName("Constant") ? new Constant(rv.left.value * lv.value) : bin(lv, rv.left, MULTIPLY);
                        let nr = rv.right.checkName("Constant") ? new Constant(rv.right.value * lv.value) : bin(lv, rv.right, MULTIPLY);
                        return bin(nl, nr, rv.type);
                    }

                    return this;
                }
                case DIVIDE: {
                    // 6 / (x * 3) => (2 / x) || 3 / (x / 3) => (9 / x)
                    if (lv?.type == DIVIDE || lv?.type == MULTIPLY) {
                        // (3 * x) / 5 => (3 / 5) * x || (3 / x) / 5 => (3 / 5) / x
                        if (lv.left.checkName("Constant")) {
                            if (rv.value == 0) throw new Error("Division by Zero");
                            let nv = lv.left.value / rv.value;
                            if (nv == 0) return new Constant(0);
                            if (lv.type == MULTIPLY) {
                                if (nv == 1) return lv.right;
                                return bin(new Constant(nv), lv.right, MULTIPLY);
                            } else {
                                return bin(new Constant(nv), lv.right, DIVIDE);
                            }
                        }
                        // (x * 3) / 5 => (3 / 5) * x || (x / 3) / 5 => x / (3 * 5)
                        if (lv.right.checkName("Constant")) {
                            let nv;
                            if (lv.type == MULTIPLY) {
                                if (rv.value == 0) throw new Error("Division by Zero");
                                nv = lv.right.value / rv.value;
                                if (nv == 0) return new Constant(0);
                                if (nv == 1) return lv.left;
                                return bin(new Constant(nv), lv.left, MULTIPLY);
                            } else {
                                nv = lv.right.value * rv.value;
                                if (nv == 0) throw new Error("Division by Zero");
                                if (nv == 1) return lv.left;
                                return bin(lv.left, new Constant(nv), DIVIDE);
                            }
                        }
                    }

                    if (rv?.type == DIVIDE || rv?.type == MULTIPLY) {
                        // 5 / (3 * x) => (5 / 3) / x || 5 / (3 / x) => (5 / 3) * x
                        if (rv.left.checkName("Constant")) {
                            if (rv.left.value == 0) throw new Error("Division by Zero");
                            let nv = lv.value / rv.left.value;
                            if (nv == 0) return new Constant(0);
                            if (rv.type == MULTIPLY) {
                                return bin(new Constant(nv), rv.right, DIVIDE);
                            } else {
                                if (nv == 1) return rv.right;
                                return bin(new Constant(nv), rv.right, MULTIPLY);
                            }
                        }
                        // 5 / (x * 3) => (5 / 3) / x || 5 / (x / 3) => (5 * 3) / x
                        if (rv.right.checkName("Constant")) {
                            let nv;
                            if (rv.type == MULTIPLY) {
                                if (rv.right.value == 0) throw new Error("Division by Zero");
                                nv = lv.value / rv.right.value;
                                if (nv == 0) return new Constant(0);
                                return bin(new Constant(nv), rv.left, DIVIDE);
                            } else {
                                nv = lv.value * rv.right.value;
                                if (nv == 0) return new Constant(0);
                                return bin(new Constant(nv), rv.left, DIVIDE);
                            }
                        }
                    }

                    if (lv?.type == ADD || lv?.type == SUBTRACT) {
                        // (5 - x) / 3 => 5 / 3 - x / 3 || (x - 5) / 3 => x / 3 - 5 / 3
                        if (rv.value == 0) throw new Error("Division by Zero");
                        let nl = lv.left.checkName("Constant") ? new Constant(lv.left.value / rv.value) : bin(lv.left, rv, DIVIDE);
                        let nr = lv.right.checkName("Constant") ? new Constant(lv.right.value / rv.value) : bin(lv.right, rv, DIVIDE);
                        return bin(nl, nr, lv.type);
                    }

                    return this;
                }
                default: return this
            }
        }

        return this
    }

    #flatCheck(node) {
        if (Symbol.typeOf(node) == "BinaryOp") {
            if (node.type == MODULUS || node.type == POWER) return null;
            return node;
        }

        return null;
    }

    /**
     * 
     * @param {BinaryOp} node 
     * @returns 
     */
    #identityFold(node) {
        const isZero = (node) => node.checkName("Constant") && node?.value == 0 || (node.checkName("UnaryOp") && node?.type == NEGATE && node?.operand.value == 0);
        const isOne = (node) => node.checkName("Constant") && node?.value == 1;
        const isNOne = (node) => (node.checkName("Constant") && node?.value == -1) || (node.checkName("UnaryOp") && node?.type == NEGATE && node?.operand.value == 1);
        const isVar = (node) => node.checkName("Variable") || (node.checkName("UnaryOp") && node?.type == NEGATE && node?.operand.checkName("Variable"))
        const ConstorVar = (node) => {
            if (this.#constValue(node) != null) return new Constant(this.#constValue(node));
            if (isVar(node)) return node;
            return null;
        }

        let rnode = node.right;
        let lnode = node.left;

        if (node.checkName("UnaryOp")) return node;

        if (ConstorVar(node.right) == null && ConstorVar(node.left) == null) {
            let nr = rnode;
            let nl = lnode;
            if (rnode.checkName("BinaryOp")) {
                nr = this.#identityFold(rnode);
            }

            if (lnode.checkName("BinaryOp")) {
                nl = this.#identityFold(lnode);
            }
            return new BinaryOp(nl, nr, node.type);
        }

        switch (node.type) {
            case ADD: {
                // 0 + x => x || x + 0 => x
                if (isZero(lnode)) return rnode;
                if (isZero(rnode)) return lnode;
                // x + x => 2 * x
                if (isVar(rnode) && isVar(lnode) && rnode?.value == lnode?.value) return new BinaryOp(new Constant(2), rnode, MULTIPLY);
                return node;
            }
            case SUBTRACT: {
                // 0 - x => -x
                if (isZero(lnode)) return new UnaryOp(rnode, NEGATE);
                // x - 0 => x
                if (isZero(rnode)) return lnode;
                // x - x => 0
                if (isVar(rnode) && isVar(lnode) && rnode?.value == lnode?.value) return new Constant(0);
                return node;
            }
            case MULTIPLY: {
                // 0 * x => 0 || x * 0 => 0
                if (isZero(rnode) || isZero(lnode)) return new Constant(0);
                // 1 * x => x || x * 1 => x
                if (isOne(rnode)) return lnode;
                if (isOne(lnode)) return rnode;
                // -1 * x => -x || x * -1 => -x
                if (isNOne(rnode)) return new UnaryOp(lnode, NEGATE);
                if (isNOne(lnode)) return new UnaryOp(rnode, NEGATE);
                // x * x => x ^ 2
                if (isVar(rnode) && isVar(lnode) && rnode?.value == lnode?.value) return new BinaryOp(rnode, new Constant(2), POWER);
                return node;
            }
            case DIVIDE: {
                // 0 / x => 0
                if (isZero(lnode)) return new Constant(0);
                // x / 0 => error
                if (isZero(rnode)) throw new Error("Division by Zero")
                // x / 1 => x
                if (isOne(rnode)) return lnode;
                // x / -1 => -x
                if (isNOne(rnode)) return new UnaryOp(lnode, NEGATE);
                // x / x => 1
                if (isVar(rnode) && isVar(lnode) && rnode?.value == lnode?.value) return new Constant(1);
                // x / C => (1 / C) * x
                if (isVar(lnode)) {
                    if (lnode.checkName("UnaryOp")) return new BinaryOp(new BinaryOp(new Constant(-1), rnode, DIVIDE), lnode.operand, MULTIPLY)
                    return new BinaryOp(new BinaryOp(new Constant(1), rnode, DIVIDE), lnode, MULTIPLY)
                };
                return node;
            }
            case POWER: {
                // x ^ 0 => 1
                if (isZero(rnode)) return new Constant(1);
                // x ^ 1 => x
                if (isOne(rnode)) return lnode;
                // 0 ^ x => 0
                if (isZero(lnode)) return new Constant(0);
                // 1 ^ x => 1
                if (isOne(lnode)) return new Constant(1);
                return node;
            }
            case MODULUS: {
                // x mod 1 => 0
                if (isOne(rnode)) return new Constant(0);
                // 0 mod x => 0
                if (isZero(lnode)) return new Constant(0);
                // x mod 0 => error
                if (isZero(rnode)) throw new Error("Mod by zero is undefined");
                // x mod x => 0
                if (isVar(rnode) && isVar(lnode) && rnode?.value == lnode?.value) return new Constant(0);
                return node;
            }
            default: return node;
        }
    }

    #flatten(node) {
        const isVar = (node) => node.checkName("Variable")
        const ConstorVar = (node) => {
            if (this.#constValue(node) != null) return new Constant(this.#constValue(node));
            if (isVar(node)) return node;
            return null;
        }

        if (node.type != ADD && node.type != SUBTRACT) return node; // Return if node is not add or multiply
        let add_arr = [];
        this.#gather(node, add_arr, ADD);
        let addOp = new NaryOp(ADD, add_arr);
        //console.log(addOp)
        return this.#combineTerms(addOp);

        //let mul_arr = [];
        //this.#gather(node, mul_arr, MULTIPLY)
        //let mulOp = new NaryOp(MULTIPLY, mul_arr);
    }

    #combineTerms(addOp) {
        const parts = addOp.arr;
        const coeffs = new Map();
        const exponents = new Map();
        let constSum = 0;
        const leftovers = [];
        const addCoeff = (map, key, delta) => map.set(key, (map.get(key) || 0) + delta);

        for (let { node, sign } of parts) {
            if (node.checkName("UnaryOp") && node?.type === NEGATE) {
                node = node.operand;
                sign = -sign;
            }

            if (node.checkName("Constant")) {
                constSum += sign * node.value;
            }

            else if (node.checkName("Variable")) {
                addCoeff(coeffs, node.value, sign);
            }

            else if (node.checkName("BinaryOp") && node.type === MULTIPLY) {
                const lConst = this.#constValue(node.left);
                const rConst = this.#constValue(node.right);

                // only linear terms  (k·x) or (x·k)
                if (lConst !== null && node.right.checkName("Variable")) {
                    addCoeff(coeffs, node.right.value, sign * lConst);
                }
                else if (rConst !== null && node.left.checkName("Variable")) {
                    addCoeff(coeffs, node.left.value, sign * rConst);
                }
                // simple powers  (k·x^n)
                else if (lConst !== null && node.right.checkName("BinaryOp") && node.right.type === POWER && node.right.left.checkName("Variable")) {
                    const key = `${node.right.left.value}^${node.right.right.toString()}`;
                    addCoeff(exponents, key, sign * lConst);
                }

                else if (rConst !== null && node.left.checkName("BinaryOp") && node.left.type === POWER && node.left.left.checkName("Variable")) {
                    const key = `${node.left.left.value}^${node.left.right.toString()}`;
                    addCoeff(exponents, key, sign * rConst);
                }

                else leftovers.push({ node, sign });
            }

            else leftovers.push({ node, sign });
        }

        const outTerms = [];

        // (a) plain variables, alphabetically
        [...coeffs.keys()].sort().forEach(v => {
            const c = coeffs.get(v);
            if (c === 0) return;
            if (c === 1) outTerms.push(new Variable(v));
            else if (c === -1) outTerms.push(new UnaryOp(new Variable(v), NEGATE));
            else c > 0 ? outTerms.push(new BinaryOp(new Constant(Math.abs(c)), new Variable(v), MULTIPLY)) : outTerms.push(new UnaryOp(new BinaryOp(new Constant(Math.abs(c)), new Variable(v), MULTIPLY), NEGATE))
        });

        // (b) powers, alphabetical by base then exponent
        [...exponents.keys()].sort().forEach(key => {
            const c = exponents.get(key);
            if (c === 0) return;
            const [base, exp] = key.split('^');
            const powerNode = new BinaryOp(new Variable(base), this.parse(exp), POWER);
            if (c === 1) outTerms.push(powerNode);
            else if (c === -1) outTerms.push(new UnaryOp(powerNode, NEGATE));
            else c > 0 ? outTerms.push(new BinaryOp(new Constant(Math.abs(c)), powerNode, MULTIPLY)) : outTerms.push(new UnaryOp(new BinaryOp(new Constant(Math.abs(c)), powerNode, MULTIPLY), NEGATE))
        });

        // (c) constant
        if (constSum !== 0) {
            constSum > 0 ? outTerms.push(new Constant(constSum)) : outTerms.push(new UnaryOp(new Constant(-constSum), NEGATE));
        }

        // (d) leftovers in original order
        for (let { node, sign } of leftovers) {
            outTerms.push(sign == -1 ? new UnaryOp(node, NEGATE) : node);
        }

        if (outTerms.length === 0) return new Constant(0);

        /* -------- 3. Chain back into left‑deep ADD tree ----- */
        let result = outTerms[0];
        for (let i = 1; i < outTerms.length; ++i) {
            if (outTerms[i].checkName("UnaryOp") && outTerms[i]?.type == NEGATE) {
                result = new BinaryOp(result, outTerms[i].operand, SUBTRACT);
            } else result = new BinaryOp(result, outTerms[i], ADD);
        }


        return result;
    }

    #gather(node, parts, op, sign = 1) {
        // Only BinaryOp nodes can be further split
        if (node.checkName("BinaryOp")) {
            // Same operator keep flattening
            if (node.type === op) {
                this.#gather(node.left, parts, op, sign);
                this.#gather(node.right, parts, op, sign);
                return;
            }

            // Special case:  subtraction inside an addition chain
            // A - B  ==  A + (-1 * B), so flip the sign for the right child
            if (op === ADD && node.type === SUBTRACT) {
                this.#gather(node.left, parts, op, sign);      // keep sign
                this.#gather(node.right, parts, op, -sign);      // negate
                return;
            }
        }

        // Leaf or different operator → store with current sign
        parts.push({ node, sign });
    }

    #astEqual(a, b) {
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
                    this.#astEqual(a.operand, b.operand);

            case 'BinaryOp':
                return a.type === b.type &&
                    this.#astEqual(a.left, b.left) &&
                    this.#astEqual(a.right, b.right);

            case 'NAryOp':
                if (a.type !== b.type || a.arr.length !== b.arr.length) return false;
                for (let i = 0; i < a.arr.length; ++i) {
                    if (!this.#astEqual(a.arr[i], b.arr[i])) return false;
                }
                return true;

            case 'Polynomial':
                return a.variable === b.variable &&
                    this.#astEqual(a.expression, b.expression);

            default:
                return false;
        }
    }

}

module.exports = BinaryOp;