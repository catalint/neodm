"use strict"
const HasOneRelationship = require('./Relationship').HasOneRelationship
const HasManyRelationship = require('./Relationship').HasManyRelationship
const neo4j = require('neo4j')
const co = require('co')
const db = require('./db')
const mainNode = require('./constants').mainNode


class ModelHelper {
    static runRaw(query) {
        return co(function*() {
            return yield db.query(query);
        })
    }

    static runQuery(query, model, nodeName) {
        return co(function*() {
            const results = yield db.query(query);
            if (results[0] !== undefined) {
                return new model(results[0][nodeName || 'node'])
            } else {
                return undefined
            }
        })
    }

    static findById(model, id, options) {
        return co(function*() {
            const results = yield db.query({
                query : `MATCH (node:${model.getModelName()}) WHERE id(node) = {id} RETURN node`,
                params: {id: id}
            });
            if (results[0] !== undefined) {
                return new model(results[0]['node'])
            } else {
                return undefined
            }
        })
    }

    static findRelationships(from, rels, options) {
        return co(function*() {
            const cypherReturns = []
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
            const cypherQuery = {
                query : `MATCH (${mainNode}:${from.getModelName()}) WHERE id(${mainNode}) = {id} ${optionalMatches.join("\n")} RETURN ${cypherReturns.join(', ')}`,
                params: {id: from.id}
            }
            const results = yield db.query(cypherQuery);
            if (!Array.isArray(results)) {
                return undefined
            }
            else if (results.length > 1) {
                throw new Error(`Unexpected relationship has more than 1 result model:${JSON.stringify(from.getModelName())} rels:${JSON.stringify(rels.filter(rel=>rel instanceof HasOneRelationship))} results:${JSON.stringify(results)}`)
            }
            else if (results[0] !== undefined) {
                const result = {}
                rels.forEach((rel)=> {
                    if (rel instanceof HasOneRelationship) {
                        result[rel.key] = new rel.to(results[0][rel.key])

                    } else if (rel instanceof HasManyRelationship) {
                        result[rel.key] = results[0][rel.key].map(r=>new rel.to(r))
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
            return results.map(function(result) {
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