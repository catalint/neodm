'use strict';

const Model = require('neodm').Model;

class Blog extends Model {
    [Model.schema]() {

    }
}

new Blog();
