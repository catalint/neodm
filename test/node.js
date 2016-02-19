'use strict';

const NeoDB = require('neodb');
//const Code = require('code');
const Lab = require('lab');
const lab = exports.lab = Lab.script();

//const describe = lab.describe;
const it = lab.it;
const before = lab.before;
const after = lab.after;
//const expect = Code.expect;


const NeoDM = require('../src');
//const Model = NeoDM.Model;

const db = new NeoDB(6363);

before((done) => {

    db
        .start()
        .then((data) => {

            NeoDM.db.setDB(data.url);
            done();
        })
        .catch((err) => done(err));
});

after((done) => {

    db
        .stop()
        .then(() => {

            done();
        })
        .catch((err) => done(err));
});

it('should create a test server', (done) => {

    done();
});
