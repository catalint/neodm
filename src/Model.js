"use strict"
const co                  = require('co')
const Joi                 = require('joi')
const neo4j               = require('neo4j')
const ModelHelper         = require('./ModelHelper')
const getSchemaKey        = require('./constants').getSchemaKey
const schemaKey           = require('./constants').getSchemaKey
const nodeKey             = require('./constants').nodeKey
const newDataKey          = require('./constants').newDataKey
const Relationship        = require('./Relationship').Relationship
const HasManyRelationship = require('./Relationship').HasManyRelationship
const HasOneRelationship  = require('./Relationship').HasOneRelationship

const relationshipsKey = Symbol('addRelationships')
const schemaValidation = Symbol('schemaValidation')

class Model {
    constructor(node) {
        this[relationshipsKey] = []
        this[newDataKey]       = {}
        const schema           = this.getSchema()
        const propertyKeys     = Object.getOwnPropertyNames(schema).filter(key=> {
            return !(schema[key] instanceof Relationship)
        })
        const relationshipKeys = Object.getOwnPropertyNames(schema).filter(key=> {
            return (schema[key] instanceof Relationship)
        })

        this._setNewNodeData(node)

        propertyKeys.forEach(key=> {
            if (key === 'id')return
            Object.defineProperty(this, key, {
                configurable: false,
                enumerable  : true,
                get(){
                    return this[nodeKey].properties[key] // todo some Object.observe to detect array/object changes and call set
                },
                set(value){
                    if (value === undefined) {
                        value = null
                    }
                    if (JSON.stringify(value) !== JSON.stringify(this[nodeKey].properties[key])) {
                        this[nodeKey].properties[key] = value
                        this[newDataKey][key]         = value
                    }
                }
            })
        })

        relationshipKeys.forEach(key=> {
            if (schema[key] instanceof HasManyRelationship) {
                Object.defineProperty(this, key, {
                    configurable: false,
                    enumerable  : true,
                    get(){
                        return Object.freeze(this[nodeKey].relationships[key])
                    },
                    set(value){
                        throw new Error(`Use ${this.getModelName()}Object.[addRelationship|setRelationship|deleteRelationship]('${key}',model|id) `)
                    }
                })
            } else if (schema[key] instanceof HasOneRelationship) {
                Object.defineProperty(this, key, {
                    configurable: false,
                    enumerable  : true,
                    get(){
                        return this[nodeKey].relationships[key]
                    },
                    set(value){
                        if (value === undefined) {
                            value = null
                        }
                        if (value === null) {
                            return this.deleteRelationship(key)
                        } else {
                            return this.setRelationship(key, value)
                        }
                    }
                })
            }

        })


        if (node !== null && node !== undefined && typeof node === "object" && !(node instanceof neo4j.Node)) {
            this.inflateData(node)
        }
    }

    inflateData(data) {
        const schema           = this.getSchema()
        const propertyKeys     = Object.getOwnPropertyNames(schema).filter(key=> {
            return !(schema[key] instanceof Relationship)
        })
        const relationshipKeys = Object.getOwnPropertyNames(schema).filter(key=> {
            return (schema[key] instanceof Relationship)
        })

        if (data !== null && typeof data === "object") {
            for (let key of propertyKeys) {
                if (data.hasOwnProperty(key) && key !== 'id') {
                    this[key] = data[key]
                }
            }

            for (let key of relationshipKeys) {
                if (data.hasOwnProperty(key)) {
                    this.setRelationship(key, data[key])
                }
            }
        } else {
            throw new Error("Expected an object")
        }
    }

    static validator() {
        if (this[schemaValidation] !== undefined) {
            return this[schemaValidation]
        }
        const schema  = this[Model.schema]()
        const ownRefs = []
        Object.getOwnPropertyNames(schema).forEach(propName=> {
            if (schema[propName].to === this) {
                ownRefs.push(propName)
                delete schema[propName]
            }
            else if (schema[propName] instanceof Model.hasOne().constructor) {
                schema[propName] = schema[propName].to.validator()
            }
            else if (schema[propName] instanceof Model.hasMany().constructor) {
                schema[propName] = Joi.array().items(schema[propName].to.validator())
            }
        })
        let joiSchema = Joi.object(schema)
        if (ownRefs.length) {
            const refKeys = {}
            for (let propName of ownRefs) {
                refKeys[propName] = joiSchema
            }
            joiSchema = joiSchema.keys(refKeys)
        }
        this[schemaValidation] = joiSchema.label(this.getModelName())
        return this[schemaValidation]
    }

    setRelationship(key, model) {
        const schema = this.getSchema()
        const rel    = schema[key]
        if (!(rel instanceof Relationship)) {
            throw new Error(`Expected a relationship for ${key}`)
        }
        if (!Array.isArray(model) && !(model instanceof Model || ModelHelper.getID(model) === undefined)) {
            throw new Error(`Expected instance of Model, id or {id:Number}, got ${require('util').inspect(model)}`)
        }

        if (rel instanceof HasOneRelationship) {
            let currentId = ModelHelper.getID(this[nodeKey].relationships[key])
            let nextId    = ModelHelper.getID(model)
            if (currentId !== nextId || nextId === undefined) {
                this[relationshipsKey].push({action: 'delete', rel: rel})
                this[relationshipsKey].push({action: 'add', rel: rel, to: model})
            }
            this[nodeKey].relationships[key] = model
        } else if (rel instanceof HasManyRelationship) {
            this[relationshipsKey].push({action: 'delete', rel: rel})
            this[nodeKey].relationships[key] = []
            if (Array.isArray(model)) {
                model.forEach(m=> {
                    this[relationshipsKey].push({action: 'add', rel: rel, to: m})
                    this[nodeKey].relationships[key].push(m)
                })
            } else {
                this[relationshipsKey].push({action: 'add', rel: rel, to: model})
                this[nodeKey].relationships[key].push(model)
            }
        }
    }

    addRelationship(key, model) {
        const schema = this.getSchema()
        const rel    = schema[key]
        if (!(rel instanceof Relationship)) {
            throw new Error(`Expected a relationship for ${key}`)
        }
        if (!(model instanceof Model || ModelHelper.getID(model) === undefined)) {
            throw new Error(`Expected instance of Model, id or {id:Number}`)
        }

        if (rel instanceof HasOneRelationship) {
            this.setRelationship(key, model)
        } else if (rel instanceof HasManyRelationship) {
            if (!Array.isArray(this[nodeKey].relationships[key])) {
                this[nodeKey].relationships[key] = []
            }
            if (Array.isArray(model)) {
                model.forEach(m=> {
                    this[relationshipsKey].push({action: 'add', rel: rel, to: model})
                    this[nodeKey].relationships[key].push(model)
                })
            } else {
                this[relationshipsKey].push({action: 'add', rel: rel, to: model})
                this[nodeKey].relationships[key].push(model)
            }
        }
    }

    deleteRelationship(key, model) {
        const schema = this.getSchema()
        const rel    = schema[key]
        if (!(rel instanceof Relationship)) {
            throw new Error(`Expected a relationship for ${key}`)
        }

        const id = ModelHelper.getID(model)

        if (rel instanceof HasOneRelationship) {
            this[nodeKey].relationships[key] = undefined
        } else if (rel instanceof HasManyRelationship) {
            if (id === undefined) {
                this[nodeKey].relationships[key] = []
            } else if (Array.isArray(this[nodeKey].relationships) && this[nodeKey].relationships.length) {
                this[nodeKey].relationships = this[nodeKey].relationships.filter(rel=> {
                    if (rel instanceof Model) {
                        return rel.id !== id
                    } else {
                        return rel !== id
                    }
                })
            }
        } else {
            throw new Error(`${key} is not a relationship`)
        }
        this[relationshipsKey].push({action: 'delete', rel: rel, to: model})
    }

    _setId(id) {
        this[nodeKey]._id = id
        Object.defineProperty(this, 'id', {
            configurable: true,
            enumerable  : true,
            value       : this[nodeKey]._id,
            writable    : false
        })

    }

    _setNewNodeData(node) {
        const schema       = this.getSchema()
        const propertyKeys = Object.getOwnPropertyNames(schema).filter(key=> {
            return !(schema[key] instanceof Relationship)
        })

        let objNode = {
            _id          : undefined,
            properties   : {},
            relationships: {}
        }

        this[newDataKey] = {}
        if (node instanceof neo4j.Node) {
            objNode = node
            for (let key of propertyKeys) {
                if (schema[key].describe().type === 'any' && objNode.properties[key] !== undefined) {
                    objNode.properties[key] = JSON.parse(objNode.properties[key])
                }
            }
        }
        objNode.relationships = objNode.relationships || {}

        Object.defineProperty(this, nodeKey, {
            configurable: true,
            enumerable  : false,
            value       : objNode,
            writable    : false
        })

        this._setId(this[nodeKey]._id)
    }

    validateProps() {
        const node = this
        return new Promise(function (resolve, reject) {
            let res = node.getModel().validator().validate(node)
            if (res.error) {
                reject(res.error)
            } else {
                resolve(res.value)
            }
        })
    }

    delete(options) {
        const node = this
        return co(function *() {
            if (node.id !== undefined) {
                yield ModelHelper.runRaw({
                    query : `MATCH (node:${this.getModelName()}) WHERE id(node) = {id} REMOVE node:${this.getModelName()} SET node:_${this.getModelName()}`,
                    params: {id: node.id}
                })
            }
        })
    }

    clone() {
        const node = this
        return co(function *() {
            if (node.id !== undefined) {
                let clone = yield ModelHelper.runRaw({
                    query : `MATCH (node:${this.getModelName()})
                    WHERE id(node) = {id}
        WITH n as map
        CREATE (copy:${this.getModelName()})
        SET copy=map return copy`,
                    params: {id: node.id}
                })
                console.log(clone)
            }
        })
    }

    save(options) {
        const node = this
        if (node.id !== undefined && Object.getOwnPropertyNames(node[newDataKey]).length === 0 && node[relationshipsKey].length === 0) {
            return Promise.resolve(node)
        }
        return co(function*() {
                let id                 = node.id
                const schema           = node.getSchema()
                const propertyKeys     = Object.getOwnPropertyNames(schema).filter(key=> {
                    return !(schema[key] instanceof Relationship)
                })
                const relationshipKeys = Object.getOwnPropertyNames(schema).filter(key=> {
                    return (schema[key] instanceof Relationship)
                })

                const validatedProps = yield node.validateProps()
                // save properties
                const setProperties = {}
                propertyKeys.forEach(key=> {
                    if (validatedProps[key] !== undefined && key !== 'id') {
                        node[key] = validatedProps[key]
                    }
                    if (node[newDataKey].hasOwnProperty(key)) {
                        if (schema[key].describe().type === 'any') {
                            setProperties[key] = JSON.stringify(node[newDataKey][key])
                        } else {
                            setProperties[key] = node[newDataKey][key]
                        }
                    }
                })
                let cypherNode = {}
                if (id === undefined) {
                    if (Object.getOwnPropertyNames(setProperties).length) {
                        cypherNode = {
                            query : `CREATE (node:${node.getModelName()} {props}) return node`,
                            params: {props: setProperties}
                        }
                    } else {
                        cypherNode = {
                            query: `CREATE (node:${node.getModelName()}) return node`,
                        }
                    }
                } else {
                    cypherNode = {
                        query : `MATCH (node:${node.getModelName()}) WHERE id(node)={id} SET node+={props} return node`,
                        params: {id: id, props: setProperties}
                    }
                }
                if (Object.getOwnPropertyNames(setProperties).length > 0 || id === undefined) {
                    const dbNode = yield ModelHelper.runQuery({
                        query : cypherNode.query,
                        params: cypherNode.params,
                        schema: {node: node.getModel()},
                        single: true
                    })
                    if (id === undefined) {
                        id                       = dbNode.id
                        node[nodeKey].properties = dbNode[nodeKey].properties
                        node[newDataKey]         = {}
                        node._setId(dbNode.id)
                    }
                }


                // save relationships models
                const relationships = node[nodeKey].relationships
                for (let key of relationshipKeys) {
                    // new relationships
                    if (relationships.hasOwnProperty(key) && schema[key] instanceof HasOneRelationship && relationships[key] instanceof Model) {
                        yield relationships[key].save()
                    } else if (relationships.hasOwnProperty(key) && schema[key] instanceof HasManyRelationship && Array.isArray(relationships[key])) {
                        yield relationships[key].filter(m=>m instanceof Model).map(m=>m.save())
                    }
                }

                // save relationships
                for (let rel of node[relationshipsKey]) {
                    if (rel.action === 'add' && rel.to instanceof rel.rel.to && rel.to.id === undefined) {
                        yield rel.to.save()
                    }
                }

                const relationshipCyphers = node[relationshipsKey].map(rel=> {
                    let id = ModelHelper.getID(rel.to)
                    if (rel.to !== undefined && id === undefined) {
                        throw new Error(`Invalid relationship ${require('util').inspect(rel)} expected ${rel.rel.to.getModelName()} to have an id`)
                    }

                    if (rel.action === 'add') {
                        return {
                            query : `MATCH (from:${node.getModelName()}),(to:${rel.rel.to.getModelName()}) WHERE id(from) = {from} AND id(to) = {to} CREATE (from)-[rel:${rel.rel.relName}]->(to) RETURN rel`,
                            params: {
                                from: node.id,
                                to  : id
                            }
                        }
                    } else if (rel.action === 'delete') {
                        if (id !== undefined) {
                            return {
                                query : `MATCH (from:${node.getModelName()})-[rel:${rel.rel.relName}]->(to:${rel.rel.to.getModelName()}) WHERE id(from) = {from} AND id(to) = {to} DELETE rel`,
                                params: {
                                    from: node.id,
                                    to  : rel.to
                                }
                            }
                        } else {
                            return {
                                query : `MATCH (from:${node.getModelName()})-[rel:${rel.rel.relName}]->(:${rel.rel.to.getModelName()}) WHERE id(from) = {from} DELETE rel`,
                                params: {
                                    from: node.id
                                }
                            }
                        }
                    }
                })

                for (let cypher of relationshipCyphers) {
                    yield ModelHelper.runRaw(cypher)
                }
                node[relationshipsKey] = []

                return node
            }
        )
    }


    getRelationships(relationshipKeys) {
        const schema       = this.getSchema()
        const from         = this
        const returnObject = Array.isArray(relationshipKeys) || relationshipKeys === undefined

        return co(function*() {
            let rels = relationshipKeys
            if (rels === undefined) {
                rels = []
                for (let key in schema) {
                    if (schema[key] instanceof Relationship) {
                        rels.push(key)
                    }
                }
            }
            if (!Array.isArray(rels)) {
                rels = [rels]
            }
            const relationshipObjects = rels.map((key)=> {
                const rel = schema[key]
                if (rel === undefined) {
                    throw `${key} relationship for model ${from.getModelName()} doesn't exist`
                }
                rel.key = key
                return rel
            })
            const relationships       = yield ModelHelper.findRelationships(from, relationshipObjects)

            if (returnObject) {
                return relationships
            } else {
                return relationships[relationshipKeys]
            }
        })
    }

    inflateRelationships(relationshipKeys) {
        if (relationshipKeys !== undefined && !Array.isArray(relationshipKeys)) {
            relationshipKeys = [relationshipKeys]
        }
        const from = this
        if (!from.id) {
            return Promise.reject('Model must be saved in db to get relationships')
        }
        return co(function*() {
            let relationships = yield from.getRelationships(relationshipKeys)
            for (let key in relationships) {
                from[nodeKey].relationships[key] = relationships[key]
            }
        })
    }

    getSchema() {
        return this.getModel()[schemaKey]()
    }

    static getSchema() {
        return this.getModel()[schemaKey]()
    }

    getModelName() {
        return this.constructor.name
    }

    getModel() {
        return this.constructor
    }

    static getModelName() {
        return this.name
    }

    static getModel() {
        return this
    }

    static [schemaKey]() {
        return {}
    }

    getNode() {
        return this[nodeKey]
    }

    static hasOne(to, options) {
        options = options || {}
        return new HasOneRelationship(to, options.name)
    }

    static hasMany(to, options) {
        options = options || {}
        return new HasManyRelationship(to, options.name)
    }

    static find(query) {
        if (query === undefined) {
            return this.find({
                query     : `MATCH (node:${this.getModelName()}) RETURN node`,
                identifier: 'node',
                list      : true
            })
        }
        else if (!isNaN(Number(query))) {
            return this.find({
                query     : `MATCH (node:${this.getModelName()}) WHERE id(node) = {id} RETURN node`,
                params    : {id: Number(query)},
                identifier: 'node',
                single    : true
            })
        }
        else if (typeof query === "string") {
            return this.find({query: query, identifier: '$main', singleList: true})
        }
        else {
            const queryOptions = {query: query.query, params: query.params, single: query.single, list: query.list}
            if (query.identifier) {
                queryOptions.single = true
                queryOptions.schema = {[query.identifier]: this}
            }
            return ModelHelper.runQuery(queryOptions)
        }
    }
}

Model.schema = schemaKey

module.exports = Model
