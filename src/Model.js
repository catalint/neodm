"use strict"
const co = require('co')
const neo4j = require('neo4j')
const ModelHelper = require('./ModelHelper')
const getSchemaKey = require('./constants').getSchemaKey
const schemaKey = require('./constants').getSchemaKey
const nodeKey = require('./constants').nodeKey
const newDataKey = require('./constants').newDataKey
const Relationship = require('./Relationship').Relationship
const HasManyRelationship = require('./Relationship').HasManyRelationship
const HasOneRelationship = require('./Relationship').HasOneRelationship

const relationshipsKey = Symbol('addRelationships')

class Model {
    constructor(node) {
        this[relationshipsKey] = []
        this[newDataKey] = {}
        const schema = this[getSchemaKey]()
        const propertyKeys = Object.getOwnPropertyNames(schema).filter(key=> {
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
                    return this[nodeKey].properties[key]
                },
                set(value){
                    if (value === undefined) {
                        value = null
                    }
                    if (!this.id || this[nodeKey].properties[key] !== this[newDataKey][key]) {
                        this[nodeKey].properties[key] = value
                        this[newDataKey][key] = value
                    }
                }
            })
        })

        relationshipKeys.forEach(key=> {
            Object.defineProperty(this, key, {
                configurable: false,
                enumerable  : true,
                get(){
                    if (schema[key] instanceof HasManyRelationship) {
                        return Object.freeze(this[nodeKey].relationships[key] || [])
                    } else {
                        return this[nodeKey].relationships[key]
                    }
                },
                set(){
                    throw new Error("Use [addRelationship|setRelationship|deleteRelationship](key,model) ")
                }
            })
        })
    }

    setRelationship(key, model) {
        const schema = this[getSchemaKey]()
        const rel = schema[key]
        this[relationshipsKey].push({action: 'delete', rel: rel})

        if (rel instanceof HasOneRelationship) {
            this[relationshipsKey].push({action: 'add', rel: rel, to: model})
            this[nodeKey].relationships[key] = model
        } else if (rel instanceof HasManyRelationship) {
            this[nodeKey].relationships[key] = []
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

    addRelationship(key, model) {
        const schema = this[getSchemaKey]()
        const rel = schema[key]
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
        const schema = this[getSchemaKey]()
        const rel = schema[key]
        let id = undefined
        if (model !== undefined) {
            if (model instanceof Model) {
                id = model.id
            } else {
                id = Number(model)
            }
        }
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

    _setNewNodeData(node) {
        Object.defineProperty(this, nodeKey, {
            configurable: true,
            enumerable  : false,
            value       : node || {
                _id          : undefined,
                properties   : {},
                relationships: {}
            },
            writable    : false
        })

        Object.defineProperty(this, 'id', {
            configurable: true,
            enumerable  : true,
            value       : this[nodeKey]._id,
            writable    : false
        })
    }

    save(options) {
        const node = this
        if (node.id !== undefined && Object.getOwnPropertyNames(node[newDataKey]).length === 0 && node[relationshipsKey].length === 0) {
            return Promise.resolve(node)
        }
        return co(function*() {
                let id = node.id
                const schema = node[getSchemaKey]()
                const propertyKeys = Object.getOwnPropertyNames(schema).filter(key=> {
                    return !(schema[key] instanceof Relationship)
                })
                const relationshipKeys = Object.getOwnPropertyNames(schema).filter(key=> {
                    return (schema[key] instanceof Relationship)
                })

                // save properties
                const setProperties = {}
                propertyKeys.forEach(key=> {
                    if (node[newDataKey].hasOwnProperty(key)) {
                        setProperties[key] = node[newDataKey][key]
                    }
                })
                let cypherNode = {}
                if (id === undefined) {
                    cypherNode = {
                        query : `CREATE (node:${node.getModelName()} {props}) return node`,
                        params: {props: setProperties}
                    }
                } else {
                    cypherNode = {
                        query : `MATCH (node:${node.getModelName()}) WHERE id(node)={id} SET node+={props} return node`,
                        params: {id: id, props: setProperties}
                    }
                }
                if (Object.getOwnPropertyNames(setProperties).length > 0 || id === undefined) {
                    const dbNode = yield ModelHelper.runQuery(cypherNode, node.getModel())
                    if (id === undefined) {
                        id = dbNode.id
                        node._setNewNodeData(dbNode[nodeKey])
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
                    let id = undefined
                    if (rel.to !== undefined) {
                        if (rel.to instanceof rel.rel.to) {
                            id = rel.to.id
                        } else {
                            id = Number(rel.to)
                        }
                        if (isNaN(id)) {
                            throw new Error(`Invalid relationship ${require('util').inspect(rel)} expected ${rel.rel.to.getModelName()} to have an id`)
                        }
                    }

                    if (rel.action === 'add') {
                        return {
                            query : `MATCH (from:${node.getModelName()}),(to:${rel.rel.to.getModelName()}) WHERE id(from) = {from} AND id(to) = {to} CREATE (a)-[rel:${rel.rel.relName}]->(b) RETURN rel`,
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

                return node
            }
        )
    }


    getRelationships(relationshipKeys) {
        const schema = this[getSchemaKey]()
        const from = this
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
            const relationships = yield ModelHelper.findRelationships(from, relationshipObjects)

            if (returnObject) {
                return relationships
            } else {
                return relationships[relationshipKeys]
            }
        })
    }

    inflateRelationships(relationshipKeys) {
        const from = this
        if (!from.id) {
            return Promise.reject('Model must be saved in db to get relationships')
        }
        return co(function*() {
            let relationships = yield from.getRelationships(relationshipKeys)
            if (from[nodeKey].relationships === undefined) {
                from[nodeKey].relationships = {}
            }
            for (let key in relationships) {
                from[nodeKey].relationships[key] = relationships[key]
            }
        })
    }

    [getSchemaKey]() {
        return this.getModel()[schemaKey]()
    }

    static [getSchemaKey]() {
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

    static findAll() {
        return ModelHelper.find(`MATCH (node:${this.getModelName()}) RETURN DISTINCT node`, {node: this})
    }

    static find(query, options) {
        if (!isNaN(Number(query))) {
            return ModelHelper.findById(this, Number(query), options)
        }
    }
}

Model.schema = schemaKey

module.exports = Model