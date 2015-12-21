"use strict"
const neodm = require('../src')
class City extends neodm.Node {
    [neodm.definition]() {
        this.country = String
        this.name = String
    }
}

class Address extends neodm.Node {
    [neodm.definition]() {
        this.street = String
        this.city = City
    }
}

class Restaurant extends neodm.Node {
    [neodm.definition]() {
        //this.
    }
}
neodm.register(City)


let bucharest = new City({name: 'Bucharest', 'missing': 'property will warn'})
bucharest.lastModified = Date.now()

console.log(bucharest)