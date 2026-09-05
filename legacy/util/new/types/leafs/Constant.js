const Leaf = require('../../structure/Leaf');

class Constant extends Leaf {
    eval(variable, value) {
        return this.value;
    }
}

module.exports = Constant;