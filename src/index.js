'use strict';

const DB = require('./db');

module.exports = {
    db: DB,
    Model: require('./Model'),
    Relationship: require('./Relationship').Relationship,
    HasManyRelationship: require('./Relationship').HasManyRelationship,
    HasOneRelationship: require('./Relationship').HasOneRelationship
};
