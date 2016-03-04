[![Build Status](https://travis-ci.org/catalint/neodm.svg?branch=master)](https://travis-ci.org/catalint/neodm) [![Coverage Status](https://coveralls.io/repos/github/catalint/neodm/badge.svg?branch=master)](https://coveralls.io/github/catalint/neodm?branch=master)


Neo4j Graph Data Model
===

Usage
===

```js
// Config
const neodm = require('neodm')
neodm.init({db:'http://localhost:7474',logger:console.log})


// Model Declaration
const Joi = require('joi')
const Model = require('neodm').Model

class Author extends Model{
 static [Model.schema](){
    return {
        name:Joi.string()
     }
    }
}

class Article extends Model{
   static [Model.schema](){
    return {
        title:Joi.string(),
        author:Model.hasOne(Author)
    }
   }
}

```

better see the tests
