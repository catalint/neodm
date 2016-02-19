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

API
===

Article.find()
---

Article.find(id)
---

Article.validator()
---
Returns a `Joi` validation object for properties & relationships


Article.save()
---

Article.addRelationship(key,id)
---

Article.addRelationship(key,model)
---

Article.setRelationship(key,id)
---

Article.setRelationship(key,model)
---

Article.deleteRelationship(key,id)
---

Article.deleteRelationship(key,model)
---

Article.deleteRelationship(key)
---
