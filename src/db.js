"use strict"
const neo4j = require('neo4j');
let db;
let logger;

function query(query) {
    if (logger !== undefined) {
        logger(query)
    }
    if (db === undefined) {
        throw new Error("db not initialized")
    }
    return new Promise((resolve, reject)=> {
        db.cypher(query, (err, result) => {
                logger(result)
                err ? reject(err) : resolve(result)
            }
        )
    })
}

module.exports = {
    query: query,
    setLogger(loggerFunction){
        logger = loggerFunction
    },
    setDB(url){
        db = new neo4j.GraphDatabase(url || "http://localhost:7474");
    }
}
