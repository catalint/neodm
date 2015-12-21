"use strict"
const constants = require('./constants')
function register(Node) {
    Node.prototype[constants.ownProperties] = {}
    Node.prototype[constants.definition].apply(Node.prototype[constants.ownProperties])
}

module.exports = {
    register: register,
    registerMainNode: register
}