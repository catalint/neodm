'use strict';

module.exports = {
    getSchemaKey: Symbol('getSchema'),
    nodeKey: Symbol('nodeData'),
    newDataKey: Symbol('newDataKey'),
    schemaKey: Symbol('schemaData'),
    mainNode: '$main',
    relationshipsKey: Symbol('addRelationships'),
    schemaValidation: Symbol('schemaValidation'),
    duplicateRelNamesValidation: Symbol('duplicateRelNamesValidation'),
    NEO_ID: Symbol('NEO_ID')
};
