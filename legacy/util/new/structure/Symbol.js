class Symbol {
    eval(variable, value) { }
    simplify() { return this; }
    toString() { }
    name() { return this.constructor.name; }
    checkName(str) { return str == this.name() }

    static typeOf(obj) {
        return obj.constructor.name;
    }

    /**
     * 
     * @param {Symbol} node 
     * @returns {Array<Symbol>}
     */
    static TreeToArray(node) {
        if (Symbol.typeOf(node) == "Constant" || Symbol.typeOf(node) == "Variable") {
            return [node];
        }

        if (Symbol.typeOf(node) == "BinaryOp" || Symbol.typeOf(node) == "Equation") {
            return [
                ...Symbol.TreeToArray(node.left),
                ...Symbol.TreeToArray(node.right),
                node.type
            ];
        }

        if (Symbol.typeOf(node) == "UnaryOp") {
            return [
                ...Symbol.TreeToArray(node.operand),
                node.type,
            ];
        }

        if (Symbol.typeOf(node) == "Polynomial") {
            return Symbol.TreeToArray(node.expression);
        }

        return [];
    }
}

module.exports = Symbol;