'use strict';

const Neo4j = require('neo4j');
const Neo4jDriver = require('neo4j-driver').v1;

let db;
let isBolt = false;
let logger = () => {};

const toInt = (number) => {

    if (isBolt) {
        number = Neo4jDriver.int(number);
    }
    else {
        number = Number(number);
    }
    return number;
};

const queryDB = (query) => {
    console.log(query)

    logger(query);
    if (db === undefined) {
        throw new Error('db not initialized');
    }
    return new Promise((resolve, reject) => {

        const resolveQuery = (err, result) => {

            logger(result);
            err ? reject(err) : resolve(result);
        };

        if (isBolt) {
            db.run(query.query, query.params).then((result) => {

                const finalResult = result.records.map((record) => {

                    const keys = record.keys || [];
                    const data = {};
                    keys.forEach((key, index) => {

                        data[key] = record._fields[index];

                        if (data[key] && data[key].hasOwnProperty('identity')) {
                            data[key]._id = data[key].identity;
                        }

                        if (Array.isArray(data[key])) {

                            data[key] = data[key].map((value) => {

                                if (value.hasOwnProperty('identity')) {
                                    value._id = value.identity;
                                }
                                return value;
                            });
                        }
                    });
                    return data;
                });

                resolve(finalResult);
            }).catch((err) => {

                reject(err);
            });
        }
        else {
            db.cypher(query, resolveQuery);
        }
    });
};

module.exports = {
    query: queryDB,
    toInt,
    Neo4jDriver,
    setLogger(loggerFunction){

        logger = loggerFunction;
    },
    setDB(url, auth){

        if (url.indexOf('bolt') !== -1) {
            const driver = Neo4jDriver.driver(url, auth);
            db = driver.session();
            isBolt = true;
        }
        else {
            db = new Neo4j.GraphDatabase(url || 'http://localhost:7474');
        }

    }
};
