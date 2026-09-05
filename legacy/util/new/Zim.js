const Constant = require(`./types/leafs/Constant`);

const { TreeToArray } = Constant;

module.exports = {
    Constant,
    Variable: require('./types/Leafs/Variable'),
    UnaryOp: require('./structure/UnaryOp'),
    BinaryOp: require('./structure/BinaryOp'),
    Equation: require('./structure/Equation'),
    Parser: require('./structure/Parser'),
    Types: require('./types/Types'),
    TreeToArray,
};