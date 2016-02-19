'use strict';

class Relationship {
    constructor(to, relName) {

        to           = to || {};
        this.to      = to;
        this.relName = relName || to.name;
    }
}

class HasManyRelationship extends Relationship {

}

class HasOneRelationship extends Relationship {
}

module.exports = {
    HasManyRelationship,
    HasOneRelationship,
    Relationship
};
