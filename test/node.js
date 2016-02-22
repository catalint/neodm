'use strict';

const NeoDB = require('neodb');
const Code = require('code');
const Lab = require('lab');
const lab = exports.lab = Lab.script();
const Co = require('co');
const Joi = require('joi');

//const describe = lab.describe;
const it = lab.it;
const before = lab.before;
const after = lab.after;
const expect = Code.expect;


const NeoDM = require('../src');
const Model = NeoDM.Model;

const db = new NeoDB(6363);


before((done) => {

    db
        .start()
        .then((data) => {

            NeoDM.db.setDB(data.url);
            //NeoDM.db.setLogger(console.log);
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

it('should define a new model with no properties', (done) => {

    class User extends Model {

    }

    const user = new User();
    expect(user).to.be.an.instanceof(Model);

    done();
});

it('should define a new model with a single property', (done) => {

    Co(function *() {

        class User extends Model {
            static [Model.schema]() {

                return {
                    username: Joi.string()
                };
            }

        }

        const johnData = { username: 'john' };
        const john = new User(johnData);
        yield john.save();

        const johnFromDB = yield User.find(john.id);
        expect(johnFromDB.username).to.be.equal(johnData.username);

        done();
    }).catch((err) => done(err));

});


it('should change value of an existing node property', (done) => {

    Co(function *() {

        class User extends Model {
            static [Model.schema]() {

                return {
                    username: Joi.string()
                };
            }

        }

        const johnData = { username: 'john' };
        const john = new User(johnData);
        yield john.save();

        const johnFromDB = yield User.find(john.id);
        expect(johnFromDB.username).to.be.equal(johnData.username);

        johnFromDB.username = 'smith';
        yield johnFromDB.save();

        const smithFromDB = yield User.find(john.id);
        expect(smithFromDB.username).to.be.equal('smith');

        done();
    }).catch((err) => done(err));

});

it('should save relationship hasOne ', (done) => {

    Co(function *() {

        class User extends Model {
            static [Model.schema]() {

                return {
                    username: Joi.string()
                };
            }

        }

        class Article extends Model {
            static [Model.schema]() {

                return {
                    title : Joi.string().default('test'),
                    author: Model.hasOne(User)
                };
            }
        }

        const johnData = { username: 'john' };
        const john = new User(johnData);
        yield john.save();


        const article = new Article({ title: 'hello world', author: john });
        yield article.save();

        expect(article.title).to.be.equal('hello world');
        expect(article.author).to.be.an.object();
        expect(article.author.id).to.be.equal(john.id);

        const articleFromDB = yield Article.find(article.id);
        yield articleFromDB.inflateRelationships();

        expect(articleFromDB.title).to.be.equal('hello world');
        expect(articleFromDB.author).to.be.an.object();
        expect(articleFromDB.author.id).to.be.equal(john.id);


        done();
    }).catch((err) => done(err));

});


it('should update relationship hasOne ', (done) => {

    Co(function *() {

        class User extends Model {
            static [Model.schema]() {

                return {
                    username: Joi.string()
                };
            }

        }

        class Article extends Model {
            static [Model.schema]() {

                return {
                    title : Joi.string().default('test'),
                    author: Model.hasOne(User)
                };
            }
        }

        const johnData = { username: 'john' };
        const john = new User(johnData);
        yield john.save();

        const smithData = { username: 'smith' };
        const smith = new User(smithData);
        yield smith.save();


        const article = new Article({ title: 'hello world', author: john });
        yield article.save();


        expect(article.title).to.be.equal('hello world');
        expect(article.author).to.be.an.object();

        expect(article.author.id).to.be.equal(john.id);

        article.author = smith;
        yield article.save();


        expect(article.title).to.be.equal('hello world');
        expect(article.author).to.be.an.object();

        expect(article.author.id).to.be.equal(smith.id);


        const articleFromDB = yield Article.find(article.id);
        yield articleFromDB.inflateRelationships();


        expect(articleFromDB.title).to.be.equal('hello world');
        expect(articleFromDB.author).to.be.an.object();

        expect(articleFromDB.author.id).to.be.equal(smith.id);


        done();
    }).catch((err) => done(err));

});


it('should select model by property', (done) => {

    Co(function *() {

        class User extends Model {
            static [Model.schema]() {

                return {
                    username: Joi.string()
                };
            }

        }

        const johnData = { username: 'john smith' };
        const john = new User(johnData);
        yield john.save();

        const johnFromDB = yield User.find({ username: johnData.username });
        expect(johnFromDB.username).to.be.equal(johnData.username);

        done();
    }).catch((err) => done(err));

});
