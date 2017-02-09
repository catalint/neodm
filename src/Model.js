'use strict';

const Co = require('co');
const Joi = require('joi');
const Hoek = require('hoek');
const ModelHelper = require('./ModelHelper');
const schemaKey = require('./constants').getSchemaKey;
const nodeKey = require('./constants').nodeKey;
const newDataKey = require('./constants').newDataKey;
const Relationship = require('./Relationship').Relationship;
const HasManyRelationship = require('./Relationship').HasManyRelationship;
const HasOneRelationship = require('./Relationship').HasOneRelationship;
const ShortID = require('shortid');

const relationshipsKey = require('./constants').relationshipsKey;
const schemaValidation = require('./constants').schemaValidation;
const duplicateRelNamesValidation = require('./constants').duplicateRelNamesValidation;
const NEO_ID = require('./constants').NEO_ID;
const mainNodeKey = require('./constants').mainNode;

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

            Object.defineProperty(this, key, {
                configurable: false,
                enumerable: true,
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
                    enumerable: true,
                    get(){

                        return this[nodeKey].relationships[key];
                    },
                    set(value){

                        throw new Error(`Use ${this.getModelName()}Object.[addRelationship|setRelationship|deleteRelationship]('${key}',model|id) `);
                    }
                });
            }
            else if (schema[key] instanceof HasOneRelationship) {
                Object.defineProperty(this, key, {
                    configurable: false,
                    enumerable: true,
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


        if (node !== null && node !== undefined && typeof node === 'object' && !Model._isDataFromDB(node)) {
            this.set(node);
        }

        this.afterInit();
    }

    afterInit() {

    }

    afterInflate(relationshipKeys) {

        return Promise.resolve();
    }

    beforeValidate() {

        return Promise.resolve();
    }

    //@deprecated
    inflateData(data) {

        return this.set(data);
    }

    set(data) {

        const schema = this.getSchema();
        const propertyKeys = Object.getOwnPropertyNames(schema).filter((key) => {

            return !(schema[key] instanceof Relationship);
        });
        const relationshipKeys = Object.getOwnPropertyNames(schema).filter((key) => {

            return (schema[key] instanceof Relationship);
        });

        if (data !== null && typeof data === 'object') {
            for (const key of propertyKeys) {
                if (data.hasOwnProperty(key)) {
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
        const ownSingleRefs = [];
        const ownManyRefs = [];
        Object.getOwnPropertyNames(schema).forEach((propName) => {

            if (schema[propName].to === this && schema[propName] instanceof Model.hasOne().constructor) {
                ownSingleRefs.push(propName);
                delete schema[propName];
            }
            else if (schema[propName].to === this && schema[propName] instanceof Model.hasMany().constructor) {
                ownManyRefs.push(propName);
                delete schema[propName];
            }
            else if (schema[propName] instanceof Model.hasOne().constructor) {
                schema[propName] = Joi.alternatives().try(schema[propName].to.validator(), Joi.number(), Joi.string());
            }
            else if (schema[propName] instanceof Model.hasMany().constructor) {
                schema[propName] = Joi.array().items([schema[propName].to.validator(), Joi.number(), Joi.string()]);
            }
        });

        let joiSchema = Joi.object(schema);
        for (let i = 0; i < 2; ++i) { //two passes to solve circular validation errors

            if (ownSingleRefs.length) {
                const refKeys = {};
                for (const propName of ownSingleRefs) {
                    refKeys[propName] = Joi.alternatives().try(joiSchema, Joi.number(), Joi.string());
                }
                joiSchema = joiSchema.keys(refKeys);
            }
            if (ownManyRefs.length) {
                const refKeys = {};
                for (const propName of ownManyRefs) {
                    refKeys[propName] = Joi.array().items([joiSchema, Joi.number(), Joi.string()]);
                }
                joiSchema = joiSchema.keys(refKeys);
            }
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
        if (!Array.isArray(model)) {
            if (!(model instanceof Model) && ModelHelper.getID(model) === undefined) {
                throw new Error(`Expected instance of Model, id or {id:Number}, got ${require('util').inspect(model)}`);
            }
        }
        else {
            for (const m of model) {
                if (!(m instanceof Model) && ModelHelper.getID(m) === undefined) {
                    throw new Error(`Expected instance of Model, id or {id:Number}, got ${require('util').inspect(m)}`);
                }
            }
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

            if (!Array.isArray(model)) {
                model = [model];
            }

            model.forEach((m) => {

                this[relationshipsKey].push({ action: 'add', rel: rel, to: m });
                this[nodeKey].relationships[key].push(m);
            });
        }
    }

    addRelationship(key, model) {

        const schema = this.getSchema();
        const rel = schema[key];
        if (!(rel instanceof Relationship)) {
            throw new Error(`Expected a relationship for ${key}`);
        }
        if (!(model instanceof Model) && ModelHelper.getID(model) === undefined) {
            throw new Error(`Expected instance of Model, id or {id:Number}, got ${model}`);
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
                        result = ModelHelper.getID((rel)) !== id;
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
        Object.defineProperty(this, NEO_ID, {
            configurable: true,
            enumerable: true,
            value: this[nodeKey]._id,
            writable: false
        });

    }

    static _isDataFromDB(node) {

        return typeof node === 'object' && node.hasOwnProperty('_id') && node.hasOwnProperty('properties');
    }

    _setNewNodeData(node) {

        const schema = this.getSchema();
        const propertyKeys = Object.getOwnPropertyNames(schema).filter((key) => {

            return !(schema[key] instanceof Relationship);
        });

        let objNode = {
            _id: undefined,
            properties: {},
            relationships: {}
        };

        this[newDataKey] = {};
        if (Model._isDataFromDB(node)) {
            objNode = node;
            for (const key of propertyKeys) {

                const type = schema[key].describe().type;
                if (['any', 'alternatives', 'object'].indexOf(type) !== -1 && objNode.properties[key] !== undefined) {
                    objNode.properties[key] = JSON.parse(objNode.properties[key]);
                }
                else if (type === 'array' && objNode.properties[key] !== undefined) {

                    const allNumbers = objNode.properties[key].every((property) => !isNaN(Number(property)));

                    if (!allNumbers) {
                        try {
                            objNode.properties[key] = objNode.properties[key].map((p) => JSON.parse(p));
                        }
                        catch (err) {
                            //just a string, not a json, I have no better idea right now
                        }
                    }

                }
            }
        }
        objNode.relationships = objNode.relationships || {};

        Object.defineProperty(this, nodeKey, {
            configurable: true,
            enumerable: false,
            value: objNode,
            writable: false
        });

        this._setId(this[nodeKey]._id);
    }

    validateProps() {

        const self = this;
        return new Promise((resolve, reject) => {

            const res = self.getModel().validator().validate(self, { abortEarly: false });
            if (res.error) {
                console.error(res);
                reject(res.error);
            }
            else {
                resolve(res.value);
            }
        });
    }

    delete() {

        const self = this;
        return Co(function *() {

            if (self[NEO_ID] === undefined) {
                throw new Error('NOT_FOUND');
            }
            return yield ModelHelper.runRaw({
                query: `MATCH (node:${self.getModelName()}) WHERE id(node) = {id} REMOVE node:${self.getModelName()} SET node:_${self.getModelName()} RETURN node;`,
                params: { id: self[NEO_ID] }
            });
        });
    }

    static _detectDuplicateRelNames() {

        const self = this;

        let duplicateRelNames;
        if (self[duplicateRelNamesValidation]) {
            duplicateRelNames = self[duplicateRelNamesValidation];
        }
        else {
            const schema = self.getSchema();
            const relationshipKeys = Object.getOwnPropertyNames(schema).filter((key) => {

                return (schema[key] instanceof Relationship);
            });

            const relNames = relationshipKeys.map((key) => {

                return { relName: schema[key].relName, key: key };
            });

            duplicateRelNames = [];
            for (const rel of relNames) {
                let found = 0;
                for (const relDup of relNames) {
                    if (relDup.relName === rel.relName) {
                        ++found;
                    }
                }
                if (found > 1) {
                    duplicateRelNames.push(JSON.stringify(rel));
                }
            }
            self[duplicateRelNamesValidation] = duplicateRelNames;
        }

        if (duplicateRelNames.length) {
            throw new Error(`Relationships names of model ${self.getModelName()} are not unique ${duplicateRelNames.join(',')}`);
        }
    }

    save(options) {

        const self = this;

        if (self[NEO_ID] !== undefined && Object.getOwnPropertyNames(self[newDataKey]).length === 0 && self[relationshipsKey].length === 0) {
            return Promise.resolve(self);
        }
        const saveData = function *() {

            self.getModel()._detectDuplicateRelNames();

            yield self.beforeValidate();
            let id = self[NEO_ID];
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

                if (validatedProps[key] !== undefined) {
                    self[key] = validatedProps[key];
                }
                if (self[newDataKey].hasOwnProperty(key)) {

                    let type;
                    try {
                        type = schema[key].describe().type;
                    }
                    catch (err) {
                        throw `${key} for model ${self.getModelName()} is not defined with Joi`;
                    }
                    if (['any', 'alternatives', 'object'].indexOf(type) !== -1) {
                        setProperties[key] = JSON.stringify(self[newDataKey][key]);
                    }
                    else if (type === 'array') {
                        const allNumbers = self[newDataKey][key].every((property) => !isNaN(Number(property)));
                        const allStrings = self[newDataKey][key].every((property) => typeof property === 'string');

                        if (allNumbers || allStrings) {
                            setProperties[key] = self[newDataKey][key];
                        }
                        else {
                            setProperties[key] = self[newDataKey][key].map((property) => JSON.stringify(property));
                        }
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
                        query: `CREATE (node:${self.getModelName()} {props}) return node`,
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
                    query: `MATCH (node:${self.getModelName()}) WHERE id(node)={id} SET node+={props} return node`,
                    params: { id: id, props: setProperties }
                };
            }
            if (Object.getOwnPropertyNames(setProperties).length > 0 || id === undefined) {
                const dbNode = yield ModelHelper.runQuery({
                    query: cypherNode.query,
                    params: cypherNode.params,
                    schema: { node: self.getModel() },
                    single: true
                });

                if (id === undefined) {
                    id = dbNode[NEO_ID];
                    self[nodeKey].properties = dbNode[nodeKey].properties;
                    self[newDataKey] = {};
                    self._setId(id);
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
                if (rel.action === 'add' && rel.to instanceof rel.rel.to && rel.to[NEO_ID] === undefined) {
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
                        query: `MATCH (from:${self.getModelName()}),(to:${rel.rel.to.getModelName()}) WHERE from.id = {from} AND to.id = {to} MERGE (from)-[rel:${rel.rel.relName}]->(to) RETURN rel`,
                        params: {
                            from: self.id,
                            to: idTo
                        }
                    };
                }
                else if (rel.action === 'delete') {
                    if (idTo !== undefined) {
                        query = {
                            query: `MATCH (from:${self.getModelName()})-[rel:${rel.rel.relName}]->(to:${rel.rel.to.getModelName()}) WHERE from.id = {from} AND to.id = {to} DELETE rel`,
                            params: {
                                from: self.id,
                                to: rel.to
                            }
                        };
                    }
                    else {
                        query = {
                            query: `MATCH (from:${self.getModelName()})-[rel:${rel.rel.relName}]->(:${rel.rel.to.getModelName()}) WHERE from.id = {from} DELETE rel`,
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

    //@deprecated
    inflateRelationships(relationshipKeys) {

        return this.inflate(relationshipKeys);
    }

    inflate(relationshipKeys) {

        const self = this;
        if (relationshipKeys !== undefined && !Array.isArray(relationshipKeys)) {
            relationshipKeys = [relationshipKeys];
        }
        if (self[NEO_ID] === undefined) {
            return Promise.reject('Model must be saved in db to get relationships');
        }
        return Co(function*() {

            const relationships = yield self.getRelationships(relationshipKeys);
            for (const key in relationships) {
                self[nodeKey].relationships[key] = relationships[key];
            }

            return self.afterInflate(relationshipKeys);
        });
    }

    getSchema() {

        const schema = this.getModel()[schemaKey]();
        if (schema.id === undefined) {
            schema.id = Joi.string().default(() => ShortID.generate(), 'ID').label(`${this.getModelName()} ID`);
        }
        return schema;
    }

    static getSchema() {

        const schema = this.getModel()[schemaKey]();
        if (schema.id === undefined) {
            schema.id = Joi.string().default(() => ShortID.generate(), 'ID').label(`${this.getModelName()} ID`);
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
                query: `MATCH (node:${this.getModelName()}) RETURN node`,
                identifier: 'node',
                list: true
            });
        }
        else if (Array.isArray(query)) {
            result = this.find({
                query: `MATCH (node:${this.getModelName()}) WHERE node.id IN {id} RETURN node`,
                params: { id: query },
                identifier: 'node',
                list: true
            });
        }
        else if (typeof query === 'string' && query.indexOf(' ') === -1) {
            result = this.find({
                query: `MATCH (node:${this.getModelName()}) WHERE node.id = {id} RETURN node`,
                params: { id: query },
                identifier: 'node',
                single: true
            });
        }
        else if (typeof query === 'string') {
            result = this.find({ query: query, identifier: mainNodeKey, singleList: true });
        }
        else if (query.query !== undefined) {
            const queryOptions = { query: query.query, params: query.params, single: query.single, list: query.list };
            if (query.identifier) {
                queryOptions.single = true;
                queryOptions.schema = { [query.identifier]: this };
            }
            result = ModelHelper.runQuery(queryOptions);
        }
        else {
            const allKeys = Object.getOwnPropertyNames(query);
            const keys = allKeys.filter((key) => !Array.isArray(query[key]));
            const arrayKeys = allKeys.filter((key) => Array.isArray(query[key]));
            const props = keys.map((key) => {

                return `${key}:{${key}}`;
            });
            const arrayProps = arrayKeys.map((key) => ` node.${key} IN {${key}} `);


            let queryString = `MATCH (node:${this.getModelName()}`;
            if (props.length) {
                queryString += ` {${props.join(', ')}} `;
            }
            queryString += ')';
            if (arrayProps.length) {
                queryString += ` WHERE ${arrayProps.join(' AND ')} `;
            }

            const queryOptions = {
                query: queryString + ' RETURN node',
                params: query,
                single: true,
                list: query.list || !!arrayProps.length
            };
            queryOptions.schema = { ['node']: this };
            result = ModelHelper.runQuery(queryOptions);
        }

        return result;
    }
}

Model.schema = schemaKey;

module.exports = Model;
