"use strict"
const HasOneRelationship  = require('./Relationship').HasOneRelationship
const HasManyRelationship = require('./Relationship').HasManyRelationship
const neo4j               = require('neo4j')
const co                  = require('co')
const db                  = require('./db')
const mainNode            = require('./constants').mainNode


class ModelHelper {
    static runRaw(query) {
        return co(function*() {
            return yield db.query(query);
        })
    }

    static getID(model) {
        if (!isNaN(Number(model))) {
            return Number(model)
        } else if (typeof model === "object") {
            return ModelHelper.getID(model.id)
        }
    }

    static runQuery(options) {
        return co(function*() {
            const schemaKeys = Object.getOwnPropertyNames(options.schema)
            let nodeName
            if (options.single) {
                nodeName = schemaKeys[0] || 'node'
            }
            let results = yield db.query({query: options.query, params: options.params})
            results     = results.map(res=> {
                schemaKeys.forEach(key=> {
                    res[key] = new (options.schema[key])(res[key])
                })
                return res
            })
            if (options.list) {
                if (options.single) {
                    return results.map(res=>res[nodeName])
                } else {
                    return results
                }
            } else if (options.single) {
                if (results[0] !== undefined) {
                    return results[0][nodeName]
                } else {
                    return undefined
                }
            } else {
                throw new Error('single or list?')
            }
        })
    }

    static findRelationships(from, rels, options) {
        return co(function*() {
            const cypherReturns   = []
            const optionalMatches = rels.map((rel) => {
                if (rel instanceof HasOneRelationship) {
                    cypherReturns.push(rel.key)
                } else if (rel instanceof HasManyRelationship) {
                    cypherReturns.push(`collect(${rel.key}) as ${rel.key}`)
                } else {
                    throw new Error("Expected relation to extend Relationship class")
                }
                return `OPTIONAL MATCH (${mainNode})-[:${rel.relName}]->(${rel.key}:${rel.to.getModelName()})`
            })
            const cypherQuery     = {
                query : `MATCH (${mainNode}:${from.getModelName()}) WHERE id(${mainNode}) = {id} ${optionalMatches.join("\n")} RETURN ${cypherReturns.join(', ')}`,
                params: {id: from.id}
            }
            const results         = yield db.query(cypherQuery);
            if (!Array.isArray(results)) {
                return undefined
            }
            else if (results.length > 1) {
                throw new Error(`Unexpected relationship has more than 1 result model:${JSON.stringify(from.getModelName())} rels:${JSON.stringify(rels.filter(rel=>rel instanceof HasOneRelationship))} results:${JSON.stringify(results)}`)
            }
            else if (results[0] !== undefined) {
                const result = {}
                rels.forEach((rel)=> {
                    if (results[0][rel.key] !== null) {
                        if (rel instanceof HasOneRelationship) {
                            result[rel.key] = new rel.to(results[0][rel.key])

                        } else if (rel instanceof HasManyRelationship) {
                            result[rel.key] = results[0][rel.key].map(r=>new rel.to(r))
                        }

                    }
                })
                return result
            } else {
                return undefined
            }
        })
    }

    static find(query, resultSchema) {
        resultSchema = resultSchema || {}
        return co(function*() {
            const results = yield dbQuery({
                query: query
            });
            return results.map(function (result) {
                for (let key in result) {
                    if (result[key] instanceof neo4j.Node) {
                        let model = Model
                        if (resultSchema[key] && resultSchema[key].prototype instanceof Model) {
                            model = resultSchema[key]
                        }
                        result[key] = new model(result[key])
                    }
                }
                return result
            })
        })
    }
}

module.exports = ModelHelper
