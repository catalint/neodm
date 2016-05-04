'use strict';

const NeoDB = require('neodb');
const Code = require('code');
const Lab = require('lab');
const lab = exports.lab = Lab.script();
const Co = require('co');
const Joi = require('joi');

const describe = lab.describe;
const it = lab.it;
const before = lab.before;
const after = lab.after;
const expect = Code.expect;


const NeoDM = require('../src');
const Model = NeoDM.Model;
const NEO_ID = require('../src/constants').NEO_ID;

const db = new NeoDB(6363);

describe('node 2', () => {

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

    it('should use sent logger', (done) => {

        let firstMessage = true;
        const gotMessage = (data) => {

            if (firstMessage) {
                firstMessage = false;
                NeoDM.db.setLogger(() => {});
                //NeoDM.db.setLogger(console.log);
                done();
            }
        };

        NeoDM.db.setLogger(gotMessage);

        class User extends Model {
            static [Model.schema]() {

                return {
                    username: Joi.string()
                };
            }

        }

        Co(function *() {

            const johnData = { username: 'john' };
            const john = new User(johnData);
            yield john.save();

        }).catch((err) => done(err));


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
                        title: Joi.string().default('test'),
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
            yield articleFromDB.inflate();

            expect(articleFromDB.title).to.be.equal('hello world');
            expect(articleFromDB.author).to.be.an.object();
            expect(articleFromDB.author.id).to.be.equal(john.id);


            done();
        }).catch((err) => done(err));

    });

    it('should add object declared with alternatives ', (done) => {

        Co(function *() {

            class User extends Model {
                static [Model.schema]() {

                    return {
                        username: Joi.string(),
                        test: Joi.alternatives([Joi.number(), Joi.string()])
                    };
                }

            }

            const johnData = { username: 'john', test: 123 };
            const john = new User(johnData);
            yield john.save();


            done();
        }).catch((err) => done(err));

    });

    it('should add object declared with when ', (done) => {

        Co(function *() {

            class User extends Model {
                static [Model.schema]() {

                    return {
                        username: Joi.string(),
                        test: Joi.when('username', {
                            is: 'john', then: Joi.boolean().required()
                        })
                    };
                }

            }

            const johnData = { username: 'john', test: true };
            const john = new User(johnData);
            yield john.save();


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
                        title: Joi.string().default('test'),
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
            yield articleFromDB.inflate();


            expect(articleFromDB.title).to.be.equal('hello world');
            expect(articleFromDB.author).to.be.an.object();

            expect(articleFromDB.author.id).to.be.equal(smith.id);


            done();
        }).catch((err) => done(err));

    });


    it('should update relationship hasOne (custom relationship name) ', (done) => {

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
                        title: Joi.string().default('test'),
                        author: Model.hasOne(User, { name: 'has_author' })
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
            yield articleFromDB.inflate();


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

    it('should delete a model', (done) => {

        Co(function *() {

            class User extends Model {
                static [Model.schema]() {

                    return {
                        username: Joi.string()
                    };
                }

            }
            class _User extends Model {
                static [Model.schema]() {

                    return {
                        username: Joi.string()
                    };
                }

            }

            const johnData = { username: 'john smith TO_BE_DELETED' };
            const john = new User(johnData);
            yield john.save();

            let johnFromDB = yield User.find({ username: johnData.username });
            expect(johnFromDB.username).to.be.equal(johnData.username);
            yield john.delete();

            johnFromDB = yield User.find({ username: johnData.username });
            expect(johnFromDB).to.be.equal(undefined);

            johnFromDB = yield _User.find({ username: johnData.username });
            expect(johnFromDB.id).to.be.equal(john.id);

            done();
        }).catch((err) => done(err));

    });


    it('should find directly in array of ids', (done) => {

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

            const smithData = { username: 'smith' };
            const smith = new User(smithData);
            yield smith.save();

            const users = yield User.find([smith.id, john.id]);
            expect(users).to.be.an.array();
            expect(users).to.have.length(2);


            done();
        }).catch((err) => done(err));

    });

    it('should find in array', (done) => {

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

            const smithData = { username: 'smith' };
            const smith = new User(smithData);
            yield smith.save();

            const users = yield User.find({ id: [smith.id, john.id] });
            expect(users).to.be.an.array();
            expect(users).to.have.length(2);


            done();
        }).catch((err) => done(err));

    });


    it('should update relationship hasMany', (done) => {

        Co(function *() {

            class User extends Model {
                static [Model.schema]() {

                    return {
                        username: Joi.string()
                    };
                }

            }
            class Comment extends Model {
                static [Model.schema]() {

                    return {
                        text: Joi.string()
                    };
                }

            }

            class Article extends Model {
                static [Model.schema]() {

                    return {
                        title: Joi.string().default('test'),
                        authors: Model.hasMany(User),
                        comments: Model.hasMany(Comment)
                    };
                }
            }

            const johnData = { username: 'john' };
            const john = new User(johnData);
            yield john.save();

            const smithData = { username: 'smith' };
            const smith = new User(smithData);
            yield smith.save();


            const article = new Article({ title: 'hello world', authors: [john, smith] });
            article.setRelationship('comments', [new Comment({ text: 'c1' }), new Comment({ text: 'c2' }), new Comment({ text: 'c3' })]);
            yield article.save();


            expect(article.title).to.be.equal('hello world');
            expect(article.authors).to.be.an.array();

            expect(article.authors).to.have.length(2);

            article.setRelationship('authors', [john, smith]);
            yield article.save();


            expect(article.authors).to.be.an.array();
            expect(article.authors).to.have.length(2);


            const articleFromDB = yield Article.find(article.id);
            yield articleFromDB.inflate();

            expect(articleFromDB.authors).to.be.an.array();
            expect(articleFromDB.authors).to.have.length(2);

            done();
        }).catch((err) => done(err));
    });

    it('save model with empty hasMany relationship', (done) => {

        Co(function *() {

            class User extends Model {
                static [Model.schema]() {

                    return {
                        username: Joi.string()
                    };
                }

            }
            class Comment extends Model {
                static [Model.schema]() {

                    return {
                        text: Joi.string()
                    };
                }

            }

            class Article extends Model {
                static [Model.schema]() {

                    return {
                        title: Joi.string().default('test'),
                        authors: Model.hasMany(User),
                        comments: Model.hasMany(Comment)
                    };
                }
            }

            const johnData = { username: 'john' };
            const john = new User(johnData);
            yield john.save();

            const smithData = { username: 'smith' };
            const smith = new User(smithData);
            yield smith.save();


            const article = new Article({ title: 'hello world', authors: [john, smith] });
            yield article.save();


            expect(article.title).to.be.equal('hello world');
            expect(article.authors).to.be.an.array();

            expect(article.authors).to.have.length(2);

            done();
        }).catch((err) => done(err));

    });

    it('should not double set hasOne before save', (done) => {

        Co(function *() {

            class User extends Model {
                static [Model.schema]() {

                    return {
                        username: Joi.string()
                    };
                }

            }
            class Comment extends Model {
                static [Model.schema]() {

                    return {
                        text: Joi.string()
                    };
                }

            }

            class Article extends Model {
                static [Model.schema]() {

                    return {
                        title: Joi.string().default('test'),
                        author: Model.hasOne(User),
                        comments: Model.hasMany(Comment)
                    };
                }
            }

            const johnData = { username: 'john' };
            const john = new User(johnData);
            yield john.save();

            const smithData = { username: 'smith' };
            const smith = new User(smithData);
            yield smith.save();


            const article = new Article({ title: 'hello world' });
            article.author = john;
            article.author = smith;

            yield article.save();


            expect(article.title).to.be.equal('hello world');
            expect(article.author).to.be.an.object();

            expect(article.author.id).to.be.equal(smith.id);

            const articleFromDB = yield Article.find(article.id);
            yield articleFromDB.inflate();

            expect(articleFromDB.title).to.be.equal('hello world');
            expect(articleFromDB.author).to.be.an.object();

            expect(articleFromDB.author.id).to.be.equal(smith.id);

            done();
        }).catch((err) => done(err));

    });


    it('should allow circular reference', (done) => {

        Co(function *() {


            class Article extends Model {
                static [Model.schema]() {

                    return {
                        title: Joi.string().default('test'),
                        hasDraft: Model.hasMany(Article, { name: 'hasDraft' }),
                        draftOf: Model.hasOne(Article, { name: 'draftOf' })
                    };
                }
            }


            const article = new Article({ title: 'hello world' });

            yield article.save();


            expect(article.title).to.be.equal('hello world');

            const articleFromDB = yield Article.find(article.id);
            yield articleFromDB.inflate();

            expect(articleFromDB.title).to.be.equal('hello world');

            expect(articleFromDB.hasDraft).to.be.an.array();
            expect(articleFromDB.hasDraft).to.be.length(0);

            done();
        }).catch((err) => done(err));

    });


    it('should allow circular reference on validation', (done) => {

        Co(function *() {


            class Article extends Model {
                static [Model.schema]() {

                    return {
                        title: Joi.string().default('test'),
                        hasDraft: Model.hasMany(Article, { name: 'hasDraft' }),
                        draftOf: Model.hasOne(Article, { name: 'draftOf' })
                    };
                }
            }


            const article = new Article({ title: 'hello world', hasDraft: [new Article({ title: 'draft' })] });

            yield article.save();


            expect(article.title).to.be.equal('hello world');

            const articleFromDB = yield Article.find(article.id);
            yield articleFromDB.inflate();

            expect(articleFromDB.title).to.be.equal('hello world');

            expect(articleFromDB.hasDraft).to.be.an.array();
            expect(articleFromDB.hasDraft).to.be.length(1);

            done();
        }).catch((err) => done(err));

    });


    it('should allow circular and save draft by id', (done) => {

        Co(function *() {


            class Article extends Model {
                static [Model.schema]() {

                    return {
                        title: Joi.string().default('test'),
                        hasDraft: Model.hasMany(Article, { name: 'hasDraft' }),
                        draftOf: Model.hasOne(Article, { name: 'draftOf' })
                    };
                }
            }


            const article = new Article({ title: 'hello world' });

            yield article.save();


            const draft = new Article({ title: 'hello world draft', draftOf: article });

            yield draft.save();

            article.addRelationship('hasDraft', draft.id);

            yield article.save();

            const articleFromDB = yield Article.find(article.id);

            expect(articleFromDB).to.exist();

            yield articleFromDB.inflate();

            expect(articleFromDB.hasDraft[0].id).to.be.equal(draft.id);

            articleFromDB.title = 'smth new';

            articleFromDB.addRelationship('hasDraft', draft.id);

            articleFromDB.setRelationship('hasDraft', { id: draft.id });

            articleFromDB.setRelationship('hasDraft', [{ id: draft.id }]);

            yield articleFromDB.save();

            done();
        }).catch((err) => done(err));

    });


    it('should call afterInit', (done) => {

        Co(function *() {

            class User extends Model {
                static [Model.schema]() {

                    return {
                        username: Joi.string()
                    };
                }

                afterInit() {

                    this.username = 'inited';
                }

            }

            const johnData = { username: 'john' };
            const john = new User(johnData);
            yield john.save();

            const dbUser = yield User.find(john.id);


            expect(dbUser.username).to.be.equal('inited');

            done();
        }).catch((err) => done(err));

    });


    it('should call beforeValidate', (done) => {

        Co(function *() {

            class User extends Model {
                static [Model.schema]() {

                    return {
                        username: Joi.string(),
                        status: Joi.string().required()
                    };
                }

                beforeValidate() {

                    this.status = 'active';
                    return Promise.resolve();
                }

            }

            const johnData = { username: 'john' };
            const john = new User(johnData);
            yield john.save();

            const dbUser = yield User.find(john.id);


            expect(dbUser.status).to.be.equal('active');

            done();
        }).catch((err) => done(err));

    });


    it('should call afterInflate', (done) => {

        Co(function *() {

            class Schedule extends Model {

                static [Model.schema]() {

                    return {
                        timestamp: Joi.number()
                    };
                }
            }

            class User extends Model {
                static [Model.schema]() {

                    return {
                        username: Joi.string(),
                        status: Joi.string().required(),
                        expires: Model.hasOne(Schedule)
                    };
                }

                afterInflate(keys) {

                    if (keys === undefined || keys.indexOf(keys) !== -1) {
                        if (this.expires.timestamp < Date.now()) {
                            this.status = 'expired';
                        }
                    }
                    return Promise.resolve();
                }

            }

            const johnData = { username: 'john', status: 'valid', expires: new Schedule({ timestamp: Date.now() }) };
            const john = new User(johnData);
            yield john.save();

            const dbUser = yield User.find(john.id);

            yield dbUser.inflate();

            expect(dbUser.status).to.be.equal('expired');

            done();
        }).catch((err) => done(err));

    });


    it('should find in array of just 1 element', (done) => {

        Co(function *() {

            class User extends Model {
                static [Model.schema]() {

                    return {
                        username: Joi.string()
                    };
                }

            }

            const smithData = { username: 'smith' };
            const smith = new User(smithData);
            yield smith.save();

            const users = yield User.find([smith.id]);
            expect(users).to.be.an.array();
            expect(users).to.have.length(1);


            done();
        }).catch((err) => done(err));

    });

    it('should find return err', (done) => {

        Co(function *() {

            class User extends Model {
                static [Model.schema]() {

                    return {
                        username: Joi.string()
                    };
                }

            }
            class Comment extends Model {
                static [Model.schema]() {

                    return {
                        text: Joi.string()
                    };
                }

            }

            class Article extends Model {
                static [Model.schema]() {

                    return {
                        title: Joi.string().default('test'),
                        author: Model.hasOne(User),
                        comments: Model.hasMany(Comment)
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

            yield NeoDM.db.query({
                query: 'MATCH (from:Article),(to:User) WHERE from.id = {from} AND to.id = {to} CREATE (from)-[rel:User]->(to) RETURN rel',
                params: {
                    from: article.id,
                    to: smith.id
                }
            });

            const dbArticle = yield Article.find(article.id);

            try {
                yield dbArticle.inflate();
                done(new Error('expected error'));
            }
            catch (err) {
                expect(err.message).to.contain('Unexpected relationship has more than 1 result');
                expect(err.message).to.contain(`id:${article[NEO_ID]}`);
                expect(err.message).to.contain('model:"Article"');
                expect(err.message).to.contain('"key":"author"');

                done();
            }


        }).catch((err) => done(err));
    });


    it('should not allow duplicate relName', (done) => {

        Co(function *() {

            class User extends Model {
                static [Model.schema]() {

                    return {
                        username: Joi.string()
                    };
                }

            }
            class Comment extends Model {
                static [Model.schema]() {

                    return {
                        text: Joi.string()
                    };
                }

            }

            class Article extends Model {
                static [Model.schema]() {

                    return {
                        title: Joi.string().default('test'),
                        editedBy: Model.hasOne(User),
                        authors: Model.hasMany(User),
                        comments: Model.hasMany(Comment)
                    };
                }
            }

            const johnData = { username: 'john' };
            const john = new User(johnData);
            yield john.save();

            const smithData = { username: 'smith' };
            const smith = new User(smithData);
            yield smith.save();


            const article = new Article({ title: 'hello world', editedBy: smith, authors: [john, smith] });

            try {
                yield article.save();

                const dbArticle = yield Article.find(article.id);

                yield dbArticle.inflate();
                done(new Error('expected error'));
            }
            catch (err) {
                expect(err.message).to.contain('Relationships names of model Article are not unique');
                expect(err.message).to.contain('{"relName":"User","key":"editedBy"}');
                expect(err.message).to.contain('{"relName":"User","key":"authors"}');

                done();
            }


        }).catch((err) => done(err));
    });

});
