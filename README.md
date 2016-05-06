[![Build Status](https://travis-ci.org/catalint/neodm.svg?branch=master)](https://travis-ci.org/catalint/neodm) [![Coverage Status](https://coveralls.io/repos/github/catalint/neodm/badge.svg?branch=master)](https://coveralls.io/github/catalint/neodm?branch=master) [![Dependency Status](https://david-dm.org/catalint/neodm.svg)](https://david-dm.org/catalint/neodm)


Neo4j Graph Data Model
===

Also works with new bolt driver

Changes
===
breaking: v3 no longer relies on neo4j id's and sets own `id` property if not set in model declaration

Usage
===

Setup
---
```js
const NeoDM = require('neodm');
NeoDM.db.setDB('http://localhost:7474');
NeoDM.db.setLogger(console.log);
```

Model Declaration
---
```js
const Joi = require('joi');
const Model = NeoDM.Model;
```

Simple model declaration
---
```js
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
```

hasOne relationship
---
```js
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

```

find( {property:value, anotherProp:value} )
---
```js

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
```

find( [ id1, id2 ] )
---
```js
const john = new User({ username: 'john' });
yield john.save();

const smith = new User({ username: 'smith' });
yield smith.save();

const users = yield User.find([smith.id, john.id]);
```

Full Model Declaration
---
```js
class Author extends Model{
    static [Model.schema](){
        return {
            name:Joi.string()
        }
    }

    afterInit(){

        //no return
    }

    afterInflate(inflatedRelationshipKeys){

        return Promise;
    }

    beforeValidate(){

        return Promise;
    }
}
```

better see the tests

-signed
