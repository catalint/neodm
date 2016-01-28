"use strict"

const Joi = require('joi')

const moves = {
    like: 'jagger',
    true: 'maybe'
}

const def = Joi.object({
    true: Joi.string().valid('maybe')
})


// OK
console.log(String(def.validate(moves).error))
// ValidationError: "like" is not allowed

// NOT OK
console.log(String(def.label('Moves').validate(moves).error))
// ValidationError: "Moves" is not allowed

// EXPECTED

// ValidationError: "like" is not allowed for "Moves"
// OR AT LEAST
// ValidationError: "like" is not allowed