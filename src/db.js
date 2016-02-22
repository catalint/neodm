'use strict';

const Neo4j = require('neo4j');
let db;
let logger = () => {};

const queryDB = (query) => {

    logger(query);
    if (db === undefined) {
        throw new Error('db not initialized');
    }
    return new Promise((resolve, reject) => {

        const resolveQuery = (err, result) => {

            logger(result);
            err ? reject(err) : resolve(result);
        };

        db.cypher(query, resolveQuery);
    });
};

module.exports = {
    query: queryDB,
    setLogger(loggerFunction){

        logger = loggerFunction;
    },
    setDB(url){

        db = new Neo4j.GraphDatabase(url || 'http://localhost:7474');
    }
};
