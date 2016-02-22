'use strict';

const Co = require('co');
const Joi = require('joi');
const Neo4j = require('neo4j');
const Hoek = require('hoek');
const ModelHelper = require('./ModelHelper');
const schemaKey = require('./constants').getSchemaKey;
const nodeKey = require('./constants').nodeKey;
const newDataKey = require('./constants').newDataKey;
const Relationship = require('./Relationship').Relationship;
const HasManyRelationship = require('./Relationship').HasManyRelationship;
const HasOneRelationship = require('./Relationship').HasOneRelationship;

const relationshipsKey = Symbol('addRelationships');
const schemaValidation = Symbol('schemaValidation');

class Model {

    constructor(node) {

        this[relationshipsKey] = [];
        this[newDataKey] = {};
        const schema = this.getSchema();
        const propertyKeys = Object.getOwnPropertyNames(schema).filter((key) => {

            return !(schema[key] instanceof Relationship);
        });

        const relationshipKeys = Object.getOwnPropertyNames(schema).filter((key) => {

            return (schema[key] instanceof Relationship);
        });

        this._setNewNodeData(node);

        propertyKeys.forEach((key) => {

            if (key === 'id') {
                return;
            }

            Object.defineProperty(this, key, {
                configurable: false,
                enumerable  : true,
                get(){

                    return this[nodeKey].properties[key]; // todo some Object.observe to detect array/object changes and call set
                },
                set(value){

                    if (value === undefined) {
                        value = null;
                    }
                    if (!Hoek.deepEqual(value, this[nodeKey].properties[key], { prototype: false })) {
                        this[nodeKey].properties[key] = value;
                        this[newDataKey][key] = value;
                    }
                }
            });
        });

        relationshipKeys.forEach((key) => {

            if (schema[key] instanceof HasManyRelationship) {
                Object.defineProperty(this, key, {
                    configurable: false,
                    enumerable  : true,
                    get(){

                        return Object.freeze(this[nodeKey].relationships[key]);
                    },
                    set(value){

                        throw new Error(`Use ${this.getModelName()}Object.[addRelationship|setRelationship|deleteRelationship]('${key}',model|id) `);
                    }
                });
            }
            else if (schema[key] instanceof HasOneRelationship) {
                Object.defineProperty(this, key, {
                    configurable: false,
                    enumerable  : true,
                    get(){

                        return this[nodeKey].relationships[key];
                    },
                    set(value){

                        if (value === undefined) {
                            value = null;
                        }

                        let result;
                        if (value === null) {
                            result = this.deleteRelationship(key);
                        }
                        else {
                            result = this.setRelationship(key, value);
                        }
                        return result;
                    }
                });
            }

        });


        if (node !== null && node !== undefined && typeof node === 'object' && !(node instanceof Neo4j.Node)) {
            this.inflateData(node);
        }
    }

    inflateData(data) {

        const schema = this.getSchema();
        const propertyKeys = Object.getOwnPropertyNames(schema).filter((key) => {

            return !(schema[key] instanceof Relationship);
        });
        const relationshipKeys = Object.getOwnPropertyNames(schema).filter((key) => {

            return (schema[key] instanceof Relationship);
        });

        if (data !== null && typeof data === 'object') {
            for (const key of propertyKeys) {
                if (data.hasOwnProperty(key) && key !== 'id') {
                    this[key] = data[key];
                }
            }

            for (const key of relationshipKeys) {
                if (data.hasOwnProperty(key)) {
                    this.setRelationship(key, data[key]);
                }
            }
        }
        else {
            throw new Error('Expected an object');
        }
    }

    static validator() {

        if (this[schemaValidation] !== undefined) {
            return this[schemaValidation];
        }
        const schema = this.getSchema();
        const ownRefs = [];
        Object.getOwnPropertyNames(schema).forEach((propName) => {

            if (schema[propName].to === this) {
                ownRefs.push(propName);
                delete schema[propName];
            }
            else if (schema[propName] instanceof Model.hasOne().constructor) {
                schema[propName] = schema[propName].to.validator();
            }
            else if (schema[propName] instanceof Model.hasMany().constructor) {
                schema[propName] = Joi.array().items(schema[propName].to.validator());
            }
        });

        let joiSchema = Joi.object(schema);
        if (ownRefs.length) {
            const refKeys = {};
            for (const propName of ownRefs) {
                refKeys[propName] = joiSchema;
            }
            joiSchema = joiSchema.keys(refKeys);
        }
        this[schemaValidation] = joiSchema.label(this.getModelName());
        return this[schemaValidation];
    }

    setRelationship(key, model) {

        const schema = this.getSchema();
        const rel = schema[key];
        if (!(rel instanceof Relationship)) {
            throw new Error(`Expected a relationship for ${key}`);
        }
        if (!Array.isArray(model) && !(model instanceof Model || ModelHelper.getID(model) === undefined)) {
            throw new Error(`Expected instance of Model, id or {id:Number}, got ${require('util').inspect(model)}`);
        }

        if (rel instanceof HasOneRelationship) {

            const currentId = ModelHelper.getID(this[nodeKey].relationships[key]);
            const nextId = ModelHelper.getID(model);

            if (currentId !== nextId || nextId === undefined) {
                this[relationshipsKey].push({ action: 'delete', rel: rel });
                this[relationshipsKey].push({ action: 'add', rel: rel, to: model });
            }
            this[nodeKey].relationships[key] = model;
        }
        else if (rel instanceof HasManyRelationship) {

            this[relationshipsKey].push({ action: 'delete', rel: rel });
            this[nodeKey].relationships[key] = [];
            if (Array.isArray(model)) {
                model.forEach((m) => {

                    this[relationshipsKey].push({ action: 'add', rel: rel, to: m });
                    this[nodeKey].relationships[key].push(m);
                });
            }
            else {
                this[relationshipsKey].push({ action: 'add', rel: rel, to: model });
                this[nodeKey].relationships[key].push(model);
            }
        }
    }

    addRelationship(key, model) {

        const schema = this.getSchema();
        const rel = schema[key];
        if (!(rel instanceof Relationship)) {
            throw new Error(`Expected a relationship for ${key}`);
        }
        if (!(model instanceof Model || ModelHelper.getID(model) === undefined)) {
            throw new Error('Expected instance of Model, id or {id:Number}');
        }

        if (rel instanceof HasOneRelationship) {
            this.setRelationship(key, model);
        }
        else if (rel instanceof HasManyRelationship) {
            if (!Array.isArray(this[nodeKey].relationships[key])) {
                this[nodeKey].relationships[key] = [];
            }
            if (Array.isArray(model)) {
                model.forEach((m) => {

                    this[relationshipsKey].push({ action: 'add', rel: rel, to: m });
                    this[nodeKey].relationships[key].push(m);
                });
            }
            else {
                this[relationshipsKey].push({ action: 'add', rel: rel, to: model });
                this[nodeKey].relationships[key].push(model);
            }
        }
    }

    deleteRelationship(key, model) {

        const schema = this.getSchema();
        const propertyRelationship = schema[key];
        if (!(propertyRelationship instanceof Relationship)) {
            throw new Error(`Expected a relationship for ${key}`);
        }

        const id = ModelHelper.getID(model);

        if (propertyRelationship instanceof HasOneRelationship) {
            this[nodeKey].relationships[key] = undefined;
        }
        else if (propertyRelationship instanceof HasManyRelationship) {
            if (id === undefined) {
                this[nodeKey].relationships[key] = [];
            }
            else if (Array.isArray(this[nodeKey].relationships) && this[nodeKey].relationships.length) {
                this[nodeKey].relationships = this[nodeKey].relationships.filter((rel) => {

                    let result;
                    if (rel instanceof Model) {
                        result = rel.id !== id;
                    }
                    else {
                        result = rel !== id;
                    }
                    return result;
                });
            }
        }
        else {
            throw new Error(`${key} is not a relationship`);
        }
        this[relationshipsKey].push({ action: 'delete', rel: propertyRelationship, to: model });
    }

    _setId(id) {

        this[nodeKey]._id = id;
        Object.defineProperty(this, 'id', {
            configurable: true,
            enumerable  : true,
            value       : this[nodeKey]._id,
            writable    : false
        });

    }

    _setNewNodeData(node) {

        const schema = this.getSchema();
        const propertyKeys = Object.getOwnPropertyNames(schema).filter((key) => {

            return !(schema[key] instanceof Relationship);
        });

        let objNode = {
            _id          : undefined,
            properties   : {},
            relationships: {}
        };

        this[newDataKey] = {};
        if (node instanceof Neo4j.Node) {
            objNode = node;
            for (const key of propertyKeys) {
                if ((schema[key].describe().type === 'any' || schema[key].describe().type === 'object') && objNode.properties[key] !== undefined) {
                    objNode.properties[key] = JSON.parse(objNode.properties[key]);
                }
                else if ((schema[key].describe().type === 'array' ) && objNode.properties[key] !== undefined) {
                    objNode.properties[key] = objNode.properties[key].map((p) => JSON.parse(p));
                }
            }
        }
        objNode.relationships = objNode.relationships || {};

        Object.defineProperty(this, nodeKey, {
            configurable: true,
            enumerable  : false,
            value       : objNode,
            writable    : false
        });

        this._setId(this[nodeKey]._id);
    }

    validateProps() {

        const self = this;
        return new Promise((resolve, reject) => {

            const res = self.getModel().validator().validate(self);
            if (res.error) {
                reject(res.error);
            }
            else {
                resolve(res.value);
            }
        });
    }

    delete(options) {

        const self = this;
        return Co(function *() {

            if (self.id !== undefined) {
                yield ModelHelper.runRaw({
                    query : `MATCH (node:${this.getModelName()}) WHERE id(node) = {id} REMOVE node:${this.getModelName()} SET node:_${this.getModelName()}`,
                    params: { id: self.id }
                });
            }
        });
    }

    clone() {

        const self = this;
        return Co(function *() {

            if (self.id !== undefined) {

                const clone = yield ModelHelper.runRaw({
                    query : `MATCH (node:${this.getModelName()})
                                WHERE id(node) = {id}
                                WITH n as map
                                CREATE (copy:${this.getModelName()})
                                SET copy=map return copy`,
                    params: { id: self.id }
                });

                console.log(clone);
            }
        });
    }

    save(options) {

        const self = this;
        if (self.id !== undefined && Object.getOwnPropertyNames(self[newDataKey]).length === 0 && self[relationshipsKey].length === 0) {
            return Promise.resolve(self);
        }
        const saveData = function *() {

            let id = self.id;
            const schema = self.getSchema();
            const propertyKeys = Object.getOwnPropertyNames(schema).filter((key) => {

                return !(schema[key] instanceof Relationship);
            });

            const relationshipKeys = Object.getOwnPropertyNames(schema).filter((key) => {

                return (schema[key] instanceof Relationship);
            });

            const validatedProps = yield self.validateProps();

            const setProperties = {};// save properties

            propertyKeys.forEach((key) => {

                if (validatedProps[key] !== undefined && key !== 'id') {
                    self[key] = validatedProps[key];
                }
                if (self[newDataKey].hasOwnProperty(key)) {

                    if ((schema[key].describe().type === 'any' || schema[key].describe().type === 'object') && objNode.properties[key] !== undefined) {
                        setProperties[key] = JSON.stringify(self[newDataKey][key]);
                    }
                    else if ((schema[key].describe().type === 'array' )) {
                        setProperties[key] = self[newDataKey][key].map((property) => JSON.stringify(property)); // todo add extra check if array items can be objects, if they are all strings/numbers no need to serialize
                    }
                    else {
                        setProperties[key] = self[newDataKey][key];
                    }
                }
            });

            let cypherNode = {};
            if (id === undefined) {
                if (Object.getOwnPropertyNames(setProperties).length) {
                    cypherNode = {
                        query : `CREATE (node:${self.getModelName()} {props}) return node`,
                        params: { props: setProperties }
                    };
                }
                else {
                    cypherNode = {
                        query: `CREATE (node:${self.getModelName()}) return node`
                    };
                }
            }
            else {
                cypherNode = {
                    query : `MATCH (node:${self.getModelName()}) WHERE id(node)={id} SET node+={props} return node`,
                    params: { id: id, props: setProperties }
                };
            }
            if (Object.getOwnPropertyNames(setProperties).length > 0 || id === undefined) {
                const dbNode = yield ModelHelper.runQuery({
                    query : cypherNode.query,
                    params: cypherNode.params,
                    schema: { node: self.getModel() },
                    single: true
                });

                if (id === undefined) {
                    id = dbNode.id;
                    self[nodeKey].properties = dbNode[nodeKey].properties;
                    self[newDataKey] = {};
                    self._setId(dbNode.id);
                }
            }


            const relationships = self[nodeKey].relationships; // save relationships models

            for (const key of relationshipKeys) { // new relationships

                if (relationships.hasOwnProperty(key) && schema[key] instanceof HasOneRelationship && relationships[key] instanceof Model) {
                    yield relationships[key].save();
                }
                else if (relationships.hasOwnProperty(key) && schema[key] instanceof HasManyRelationship && Array.isArray(relationships[key])) {
                    yield relationships[key].filter((m) => m instanceof Model).map((m) => m.save());
                }
            }


            for (const rel of self[relationshipsKey]) {// save relationships
                if (rel.action === 'add' && rel.to instanceof rel.rel.to && rel.to.id === undefined) {
                    yield rel.to.save();
                }
            }

            const relationshipCyphers = self[relationshipsKey].map((rel) => {

                const idTo = ModelHelper.getID(rel.to);
                if (rel.to !== undefined && idTo === undefined) {
                    throw new Error(`Invalid relationship ${require('util').inspect(rel)} expected ${rel.rel.to.getModelName()} to have an id`);
                }

                let query;

                if (rel.action === 'add') {
                    query = {
                        query : `MATCH (from:${self.getModelName()}),(to:${rel.rel.to.getModelName()}) WHERE id(from) = {from} AND id(to) = {to} CREATE (from)-[rel:${rel.rel.relName}]->(to) RETURN rel`,
                        params: {
                            from: self.id,
                            to  : idTo
                        }
                    };
                }
                else if (rel.action === 'delete') {
                    if (idTo !== undefined) {
                        query = {
                            query : `MATCH (from:${self.getModelName()})-[rel:${rel.rel.relName}]->(to:${rel.rel.to.getModelName()}) WHERE id(from) = {from} AND id(to) = {to} DELETE rel`,
                            params: {
                                from: self.id,
                                to  : rel.to
                            }
                        };
                    }
                    else {
                        query = {
                            query : `MATCH (from:${self.getModelName()})-[rel:${rel.rel.relName}]->(:${rel.rel.to.getModelName()}) WHERE id(from) = {from} DELETE rel`,
                            params: {
                                from: self.id
                            }
                        };
                    }
                }
                if (!query) {
                    throw new Error('badImplementation');
                }
                return query;
            });

            for (const cypher of relationshipCyphers) {
                yield ModelHelper.runRaw(cypher);
            }
            self[relationshipsKey] = [];

            return self;
        };

        return Co(saveData);
    }


    getRelationships(relationshipKeys) {

        const self = this;
        const schema = this.getSchema();
        const returnObject = Array.isArray(relationshipKeys) || relationshipKeys === undefined;

        return Co(function*() {

            let rels = relationshipKeys;
            if (rels === undefined) {
                rels = [];
                for (const key in schema) {
                    if (schema[key] instanceof Relationship) {
                        rels.push(key);
                    }
                }
            }
            if (!Array.isArray(rels)) {
                rels = [rels];
            }
            const relationshipObjects = rels.map((key) => {

                const rel = schema[key];
                if (rel === undefined) {
                    throw `${key} relationship for model ${self.getModelName()} doesn't exist`;
                }
                rel.key = key;
                return rel;
            });

            let result = yield ModelHelper.findRelationships(self, relationshipObjects);

            if (!returnObject) {
                result = result[relationshipKeys];
            }
            return result;
        });
    }

    inflateRelationships(relationshipKeys) {

        const self = this;
        if (relationshipKeys !== undefined && !Array.isArray(relationshipKeys)) {
            relationshipKeys = [relationshipKeys];
        }
        if (!self.id) {
            return Promise.reject('Model must be saved in db to get relationships');
        }
        return Co(function*() {

            const relationships = yield self.getRelationships(relationshipKeys);
            for (const key in relationships) {
                self[nodeKey].relationships[key] = relationships[key];
            }
        });
    }

    getSchema() {

        const schema = this.getModel()[schemaKey]();
        if (schema.id === undefined) {
            schema.id = Joi.number().label(`${this.getModelName()} ID`);
        }
        return schema;
    }

    static getSchema() {

        const schema = this.getModel()[schemaKey]();
        if (schema.id === undefined) {
            schema.id = Joi.number().label(`${this.getModelName()} ID`);
        }
        return schema;
    }

    getModelName() {

        return this.constructor.name;
    }

    getModel() {

        return this.constructor;
    }

    static getModelName() {

        return this.name;
    }

    static getModel() {

        return this;
    }

    static [schemaKey]() {

        return {};
    }

    getNode() {

        return this[nodeKey];
    }

    static hasOne(to, options) {

        options = options || {};
        return new HasOneRelationship(to, options.name);
    }

    static hasMany(to, options) {

        options = options || {};
        return new HasManyRelationship(to, options.name);
    }

    static find(query) {

        let result;

        if (query === undefined) {
            result = this.find({
                query     : `MATCH (node:${this.getModelName()}) RETURN node`,
                identifier: 'node',
                list      : true
            });
        }
        else if (!isNaN(Number(query))) {
            result = this.find({
                query     : `MATCH (node:${this.getModelName()}) WHERE id(node) = {id} RETURN node`,
                params    : { id: Number(query) },
                identifier: 'node',
                single    : true
            });
        }
        else if (typeof query === 'string') {
            result = this.find({ query: query, identifier: '$main', singleList: true });
        }
        else {
            const queryOptions = { query: query.query, params: query.params, single: query.single, list: query.list };
            if (query.identifier) {
                queryOptions.single = true;
                queryOptions.schema = { [query.identifier]: this };
            }
            result = ModelHelper.runQuery(queryOptions);
        }

        return result;
    }
}

Model.schema = schemaKey;

module.exports = Model;
