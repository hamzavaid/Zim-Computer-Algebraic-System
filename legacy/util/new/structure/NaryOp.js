const Symbol = require(`./Symbol`);
const { NARY_TYPES, UNARY_TYPES, BINARY_TYPES } = require(`../types/Types`);
const Variable = require("../types/Leafs/Variable");
const BinaryOp = require("./BinaryOp");
const Constant = require("../types/leafs/Constant");

const { ADD, MULTIPLY } = NARY_TYPES;
const { NEGATE, ABSOLUTE } = UNARY_TYPES;
const { POWER, DIVIDE } = BINARY_TYPES;

class NaryOp extends Symbol {
    /**
     * 
     * @param {NARY_TYPES} type 
     * @param {Array<Symbol>} arr 
     */
    constructor(type, arr) {
        super();
        this.type = type;
        this.arr = arr;
    }

    eval(variable, value) {
        // TODO
    }

    simplify() {
        this.arr = this.arr.map(v => v.simplify())
    }

    toString() {
        return this.arr.map(v => v.toString()).join(` ${this.type} `);
    }
}

module.exports = NaryOp;