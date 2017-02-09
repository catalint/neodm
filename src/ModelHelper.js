'use strict';

const HasOneRelationship = require('./Relationship').HasOneRelationship;
const HasManyRelationship = require('./Relationship').HasManyRelationship;
const Co = require('co');
const Db = require('./db');
const mainNode = require('./constants').mainNode;
const NEO_ID = require('./constants').NEO_ID;


class ModelHelper {
    static runRaw(query) {

        return Co(function*() {

            return yield Db.query(query);
        });
    }

    static getID(model) {

        if (typeof model === 'object') {
            return ModelHelper.getID(model.id);
        }

        return model;
    }

    static runQuery(options) {

        return Co(function*() {

            const schemaKeys = Object.getOwnPropertyNames(options.schema);
            let nodeName;
            if (options.single) {
                nodeName = schemaKeys[0] || 'node';
            }
            let results = yield Db.query({ query: options.query, params: options.params });
            results = results.map((res) => {

                schemaKeys.forEach((key) => {

                    res[key] = new (options.schema[key])(res[key]);
                });

                return res;
            });

            if (options.list && options.single) {
                results = results.map((res) => res[nodeName]);
            }
            else if (options.single) {
                if (results[0] !== undefined) {
                    results = results[0][nodeName];
                }
                else {
                    results = undefined;
                }
            }
            else {
                throw new Error('single or list?');
            }

            return results;
        });
    }

    static findRelationships(from, rels, options) {

        return Co(function*() {

            const cypherReturns = [mainNode];
            const optionalMatches = rels.map((rel) => {


                let cypherWith = '';
                if (rel instanceof HasOneRelationship) {
                    cypherWith = rel.key;
                }
                else if (rel instanceof HasManyRelationship) {
                    cypherWith = `collect(distinct ${rel.key}) as ${rel.key}`;
                }
                else {
                    throw new Error('Expected relation to extend Relationship class');
                }
                const optionalMatch = `OPTIONAL MATCH (${mainNode})-[:${rel.relName}]->(${rel.key}:${rel.to.getModelName()}) WITH ${cypherReturns.concat([cypherWith]).join(', ')}`;
                cypherReturns.push(rel.key);

                return optionalMatch;
            });

            const cypherQuery = {
                query: `MATCH (${mainNode}:${from.getModelName()}) WHERE id(${mainNode}) = {id} ${optionalMatches.join('\n')} RETURN ${cypherReturns.join(', ')}`,
                params: { id: Db.toInt(from[NEO_ID]) }
            };

            const results = yield Db.query(cypherQuery);
            if (!Array.isArray(results)) {
                return undefined;
            }
            else if (results.length > 1) {

                const hasOneRels = rels.filter((rel) => rel instanceof HasOneRelationship);
                const noResults = results.length;

                hasOneRels.forEach((rel) => {

                    for (let i = 1; i < noResults; ++i) {
                        const cur = results[i];
                        const prev = results[i - 1];
                        if (JSON.stringify(prev[rel.key]) !== JSON.stringify(cur[rel.key])) {
                            throw new Error(`Unexpected relationship has more than 1 result id:${from[NEO_ID]} model:${JSON.stringify(from.getModelName())} rel:${JSON.stringify(rel)}`);
                        }
                    }
                });

                throw new Error(`Unexpected relationship has more than 1 result model:${JSON.stringify(from.getModelName())} rels:${JSON.stringify(rels.filter((rel) => rel instanceof HasOneRelationship))} results:${JSON.stringify(results)}`);
            }
            else if (results[0] !== undefined) {
                const result = {};
                rels.forEach((rel) => {

                    if (results[0][rel.key] !== null) {
                        if (rel instanceof HasOneRelationship) {
                            result[rel.key] = new rel.to(results[0][rel.key]);

                        }
                        else if (rel instanceof HasManyRelationship) {
                            result[rel.key] = results[0][rel.key].map((r) => new rel.to(r));
                        }

                    }
                });

                return result;
            }
            else {
                return undefined;
            }
        });
    }

    static find(query, resultSchema) {

        resultSchema = resultSchema || {};
        return Co(function*() {

            const results = yield Db.query({ query });

            return results.map((result) => {

                for (const key in result) {
                    if (Model._isDataFromDB(result[key])) {
                        let model = Model;
                        if (resultSchema[key] && resultSchema[key].prototype instanceof Model) {
                            model = resultSchema[key];
                        }
                        result[key] = new model(result[key]);
                    }
                }
                return result;
            });
        });
    }
}

module.exports = ModelHelper;

const Model = require('./Model');
