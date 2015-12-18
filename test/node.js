"use strict"
let neodm = require('../src')

class City extends neodm.Node {
    get name() {
        return String
    }
}

let bucharest = new City()