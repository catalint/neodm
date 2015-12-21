"use strict"
const constants = require('./constants')
class NodePrivate {
    static setBulkValues(values) {
        Object.keys(values).forEach(property=> {
            NodePrivate.setValue.call(this, property, values[property])
        })
    }

    static setValue(property, value) {
        if (this[constants.ownProperties][property] !== undefined) {
            this[property] = value
        } else {
            console.warn(`Trying to set undeclared property ${property} with value ${value} on ${this.constructor.name} `)
        }
    }
}

class Node {
    constructor(values) {
        NodePrivate.setBulkValues.apply(this, arguments)
    }

    [constants.definition]() {
        this.id = Number
        this.lastModified = Number
    }

    save() {

    }
}

require('./Registrar').registerMainNode(Node)

module.exports = Node