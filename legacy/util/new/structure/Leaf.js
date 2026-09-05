const Symbol = require('./Symbol');

class Leaf extends Symbol {
    constructor(value) {
        super();
        this.value = value;
    }

    toString() {
        return this.value;
    }
}

module.exports = Leaf;