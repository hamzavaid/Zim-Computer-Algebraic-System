const Leaf = require('../../structure/Leaf');

class Variable extends Leaf {
    eval(variable, value) {
        if (variable == this.value) {
            return value;
        }
        return this.value;
    }
}

module.exports = Variable;