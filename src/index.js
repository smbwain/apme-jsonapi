"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = y[op[0] & 2 ? "return" : op[0] ? "throw" : "next"]) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [0, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var asyncMW = require("async-mw");
var querystring = require("querystring");
var errors_1 = require("../errors");
var validate_1 = require("../validate");
var Joi = require("joi");
var resource_1 = require("../resource");
var resources_lists_1 = require("../resources-lists");
function parseFields(fields) {
    var res = {};
    if (fields) {
        validate_1.validate(fields, schemas.fields, 'Fields validation');
        for (var collectionName in fields) {
            res[collectionName] = new Set(fields[collectionName].split(','));
        }
    }
    return res;
}
function parseInclude(includeString) {
    if (!includeString) {
        return null;
    }
    validate_1.validate(includeString, schemas.include, 'Include validation');
    var res = {};
    for (var _i = 0, _a = includeString.split(','); _i < _a.length; _i++) {
        var includeElement = _a[_i];
        var curObj = res;
        for (var _b = 0, _c = includeElement.split('.'); _b < _c.length; _b++) {
            var current = _c[_b];
            curObj = curObj[current] || (curObj[current] = {});
        }
    }
    return res;
}
var schemas = {};
{
    var rel = Joi.object().unknown(false).keys({
        id: Joi.string().required(),
        type: Joi.string().required()
    });
    schemas.relationship = Joi.object().unknown(false).keys({
        data: Joi.alternatives().required()["try"](Joi.array().items(rel), rel)
    });
    schemas.relationshipToMany = Joi.object().unknown(false).keys({
        data: Joi.array(rel)
    });
    schemas.update = Joi.object().required().keys({
        data: Joi.object().required().unknown(false).keys({
            id: Joi.string(),
            type: Joi.string(),
            attributes: Joi.object(),
            relationships: Joi.object().pattern(/.*/, schemas.relationship)
        }),
        meta: Joi.object()
    });
    schemas.fields = Joi.object().pattern(/.*/, Joi.string());
    schemas.include = Joi.string();
}
var JsonApi = (function () {
    function JsonApi(apme, _a) {
        var _b = (_a === void 0 ? {} : _a).url, url = _b === void 0 ? '/' : _b;
        this.apme = apme;
        this.url = url;
    }
    JsonApi.prototype.urlBuilder = function (path, params) {
        return this.url + path + ((params && Object.keys(params).length) ? '?' + querystring.stringify(params) : '');
    };
    JsonApi.prototype.expressInitMiddleware = function () {
        var _this = this;
        return function (req, res, next) {
            req.apmeContext = _this.apme.context({
                req: req
            });
            next();
        };
    };
    JsonApi.prototype.expressJsonApiRouter = function () {
        var _this = this;
        var router = require('express').Router();
        router.param('collection', function (req, res, next, type) {
            req.collection = _this.apme.collections[type];
            req.type = type;
            if (!req.collection) {
                next(errors_1.notFoundError('No collection found'));
                return;
            }
            next();
        });
        router.param('id', function (req, res, next, id) {
            req.id = id;
            next();
        });
        router.use(function (req, res, next) {
            res.set('Content-Type', 'application/vnd.api+json');
            next();
        });
        var parseFieldsMiddleware = function (req, res, next) {
            var fields = parseFields(req.query.fields);
            _this.validateFields(fields);
            req.apmeContext.fields = fields;
            req.include = parseInclude(req.query.include);
            next();
        };
        router.get('/:collection', parseFieldsMiddleware, asyncMW(function (req) { return __awaiter(_this, void 0, void 0, function () {
            var type, _a, filter, sort, page, list, included, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        type = req.type;
                        _a = req.query, filter = _a.filter, sort = _a.sort, page = _a.page;
                        return [4 /*yield*/, req.apmeContext.list(type, { sort: sort, page: page, filter: filter }).load()];
                    case 1:
                        list = _c.sent();
                        _b = this.packResourcesListItems;
                        return [4 /*yield*/, list.include(req.include)];
                    case 2:
                        included = _b.apply(this, [_c.sent()]);
                        return [2 /*return*/, {
                                data: this.packResourcesListItems(list),
                                meta: list.meta,
                                included: included.length ? included : undefined,
                                links: {
                                    self: this.urlBuilder("" + type, req.query)
                                }
                            }];
                }
            });
        }); }));
        router.get('/:collection/:id', asyncMW(function (req) { return __awaiter(_this, void 0, void 0, function () {
            var collection, type, id, resource, fields, include, included, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        collection = req.collection;
                        type = req.type, id = req.id;
                        return [4 /*yield*/, req.apmeContext.resource(type, id).load()];
                    case 1:
                        resource = _b.sent();
                        if (!resource.exists) {
                            throw errors_1.notFoundError();
                        }
                        fields = parseFields(req.query.fields);
                        include = parseInclude(req.query.include);
                        _a = this.packResourcesListItems;
                        return [4 /*yield*/, resource.include(include)];
                    case 2:
                        included = _a.apply(this, [_b.sent()]);
                        return [2 /*return*/, {
                                data: this.packResource(resource),
                                included: included.length ? included : undefined,
                                links: {
                                    self: this.urlBuilder(type + "/" + id, req.query)
                                }
                            }];
                }
            });
        }); }));
        var updaterMiddleware = function (patch) {
            return asyncMW(function (req) { return __awaiter(_this, void 0, void 0, function () {
                var collection, body, id, data, passedRels, relName, rel, passedRelData, relValue, _a, _b, resource, fields, include, included, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            collection = req.collection;
                            return [4 /*yield*/, new Promise(function (resolve, reject) {
                                    Joi.validate(req.body, schemas.update, function (err, value) {
                                        err ? reject(err) : resolve(value);
                                    });
                                })];
                        case 1:
                            body = _d.sent();
                            req.meta = body.meta || {};
                            // @todo: return 400 on error
                            // check type
                            if (body.data.type && body.data.type != req.type) {
                                throw errors_1.badRequestError('Wrong "type" passed in document');
                            }
                            id = body.data.id;
                            data = collection.unpackAttrs(body.data.attributes || {}, patch);
                            passedRels = body.data.relationships || {};
                            for (relName in passedRels) {
                                rel = collection.rels[relName];
                                if (!rel) {
                                    throw errors_1.badRequestError('Bad relation name');
                                }
                                passedRelData = passedRels[relName].data;
                                relValue = void 0;
                                if (Array.isArray(passedRelData)) {
                                    relValue = passedRelData.map(function (data) { return req.apmeContext.resource(data.type, data.id); });
                                }
                                else {
                                    relValue = passedRelData ? req.apmeContext.resource(passedRelData.type, passedRelData.id) : null;
                                }
                                rel.setData(data, relValue);
                            }
                            if (!patch) return [3 /*break*/, 2];
                            if (id) {
                                if (id != req.id) {
                                    throw errors_1.badRequestError('Wrong "id" passed in document');
                                }
                            }
                            else {
                                id = req.id;
                            }
                            return [3 /*break*/, 8];
                        case 2:
                            if (!id) return [3 /*break*/, 6];
                            _a = !collection.passId;
                            if (_a) return [3 /*break*/, 5];
                            _b = typeof collection.passId == 'function';
                            if (!_b) return [3 /*break*/, 4];
                            return [4 /*yield*/, collection.passId(req.apmeContext, id)];
                        case 3:
                            _b = !(_d.sent());
                            _d.label = 4;
                        case 4:
                            _a = (_b);
                            _d.label = 5;
                        case 5:
                            if (_a) {
                                throw errors_1.badRequestError('Passing id is not allowed');
                            }
                            return [3 /*break*/, 8];
                        case 6: return [4 /*yield*/, collection.generateId(data, req.apmeContext)];
                        case 7:
                            id = _d.sent();
                            _d.label = 8;
                        case 8:
                            resource = req.apmeContext.resource(req.type, id);
                            if (!patch) return [3 /*break*/, 10];
                            return [4 /*yield*/, resource.update(data)];
                        case 9:
                            _d.sent();
                            if (!resource.exists) {
                                throw errors_1.notFoundError();
                            }
                            return [3 /*break*/, 12];
                        case 10: return [4 /*yield*/, resource.create(data)];
                        case 11:
                            _d.sent();
                            _d.label = 12;
                        case 12:
                            fields = parseFields(req.query.fields);
                            include = parseInclude(req.query.include);
                            _c = this.packResourcesListItems;
                            return [4 /*yield*/, resource.include(include)];
                        case 13:
                            included = _c.apply(this, [_d.sent()]);
                            return [2 /*return*/, {
                                    data: this.packResource(resource),
                                    included: included.length ? included : undefined,
                                    links: {
                                        self: this.urlBuilder(resource.type + "/" + resource.id) // @todo: params
                                    },
                                    meta: Object.keys(req.apmeContext.meta).length ? req.apmeContext.meta : undefined
                                }];
                    }
                });
            }); });
        };
        router.post('/:collection', updaterMiddleware(false));
        router.patch('/:collection/:id', updaterMiddleware(true));
        router["delete"]('/:collection/:id', asyncMW(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, req.apmeContext.resource(req.type, req.id).remove()];
                    case 1:
                        if (!(_a.sent())) {
                            throw errors_1.notFoundError();
                        }
                        res.status(204).send();
                        return [2 /*return*/, null];
                }
            });
        }); }));
        router.get('/:collection/:id/:relName', asyncMW(function (req) { return __awaiter(_this, void 0, void 0, function () {
            var collection, type, id, relName, rel, mainResource, fields, data, resource, list;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        collection = req.collection;
                        type = req.type, id = req.id;
                        relName = req.params.relName;
                        rel = collection.rels[relName];
                        if (!rel) {
                            throw errors_1.notFoundError('No relation with such name');
                        }
                        return [4 /*yield*/, req.apmeContext.resource(type, id).load()];
                    case 1:
                        mainResource = _a.sent();
                        if (!mainResource.exists) {
                            throw errors_1.notFoundError();
                        }
                        fields = parseFields(req.query.fields);
                        data = null;
                        if (!rel.toOne) return [3 /*break*/, 5];
                        return [4 /*yield*/, rel.getResourceOne(mainResource)];
                    case 2:
                        resource = _a.sent();
                        if (!resource) return [3 /*break*/, 4];
                        return [4 /*yield*/, resource.load()];
                    case 3:
                        _a.sent();
                        if (resource.exists) {
                            data = this.packResource(resource);
                        }
                        _a.label = 4;
                    case 4: return [3 /*break*/, 8];
                    case 5: return [4 /*yield*/, rel.getListOne(mainResource)];
                    case 6:
                        list = _a.sent();
                        return [4 /*yield*/, list.load()];
                    case 7:
                        _a.sent();
                        data = this.packResourcesListItems(list);
                        _a.label = 8;
                    case 8: 
                    // @todo: add included
                    return [2 /*return*/, {
                            data: data,
                            links: {
                                self: this.urlBuilder(type + "/" + id + "/" + relName)
                            }
                        }];
                }
            });
        }); }));
        router.get('/:collection/:id/relationships/:relName', asyncMW(function (req) { return __awaiter(_this, void 0, void 0, function () {
            var collection, type, id, relName, rel, mainResource, _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        collection = req.collection;
                        type = req.type, id = req.id;
                        relName = req.params.relName;
                        rel = collection.rels[relName];
                        if (!rel) {
                            throw errors_1.notFoundError('No relation with such name');
                        }
                        return [4 /*yield*/, req.apmeContext.resource(type, id).load()];
                    case 1:
                        mainResource = _c.sent();
                        if (!mainResource.exists) {
                            throw errors_1.notFoundError();
                        }
                        _a = {};
                        _b = this.packRefData;
                        return [4 /*yield*/, rel.getOne(mainResource)];
                    case 2: 
                    /*let data;
                     if(rel.toOne) {
                     const resource = await rel.getResourceOne(mainResource);
                     data = resource ? resource.packRef() : null
                     } else {
                     const list = await rel.getListOne(mainResource);
                     await list.load();
                     //console.log('>>list', list);
                     data = list.packRefs();
                     }*/
                    return [2 /*return*/, (_a.data = _b.apply(this, [_c.sent()]),
                            _a.links = {
                                self: this.urlBuilder(type + "/" + id + "/relationships/" + relName),
                                related: this.urlBuilder(type + "/" + id + "/" + relName)
                            },
                            _a)];
                }
            });
        }); }));
        /*router.patch('/:collection/:id/relationships/:relName', asyncMW(async req => {
         /!*const body = await new Promise((resolve, reject) => {
         Joi.validate(req.body, schemas.relationship, (err, value) => {
         err ? reject(err) : resolve(value);
         });
         });*!/
         // @todo
         // @todo: return 400 on error
         }));

         router.post('/:collection/:id/relationships/:relName', asyncMW(async req => {
         /!*const body = await new Promise((resolve, reject) => {
         Joi.validate(req.body, schemas.relationshipToMany, (err, value) => {
         err ? reject(err) : resolve(value);
         });
         });*!/
         // @todo
         // @todo: return 400 on error
         }));

         router.delete('/:collection/:id/relationships/:relName', asyncMW(async req => {
         /!*const body = await new Promise((resolve, reject) => {
         Joi.validate(req.body, schemas.relationshipToMany, (err, value) => {
         err ? reject(err) : resolve(value);
         });
         });*!/
         // @todo
         // @todo: return 400 on error
         }));*/
        return router;
    };
    JsonApi.prototype.validateFields = function (fields) {
        for (var collectionName in fields) {
            var collection = this.apme.collections[collectionName];
            if (!collection) {
                throw errors_1.badRequestError("Unknown collection " + collectionName);
            }
            if (collection.fieldsSetToGet) {
                for (var _i = 0, _a = fields[collectionName]; _i < _a.length; _i++) {
                    var fieldName = _a[_i];
                    if (!collection.fieldsSetToGet.has(fieldName)) {
                        throw errors_1.badRequestError("Unknown attribute or relationship \"" + collectionName + "\".\"" + fieldName + "\"");
                    }
                }
            }
        }
    };
    JsonApi.prototype.packResource = function (resource) {
        var collection = this.apme.collections[resource.type];
        var data = {
            id: resource.id,
            type: resource.type,
            attributes: collection.packAttrs(resource.data, resource.context.fields[resource.type])
            /*links: {
                self: this.urlBuilder(`${resource.type}/${resource.id}`)
            }*/
        };
        if (Object.keys(collection.rels).length) {
            data.relationships = {};
            for (var relName in collection.rels) {
                /*if(fields && !fields[relName]) {
                 continue;
                 }*/
                var relData = resource.rels[relName];
                if (relData === undefined) {
                    throw new Error("No relationship data " + resource.type + ":" + relName);
                }
                data.relationships[relName] = {
                    data: this.packRefData(relData),
                    links: {
                        self: this.urlBuilder(resource.type + "/" + resource.id + "/relationships/" + relName)
                    }
                };
                /*if(this.rels[relName] instanceof Resource) {
                 data.relationships[relName].data = this.rels[relName].packRef();
                 } else if (this.rels[relName] instanceof AbstractResourcesList) {
                 data.relationships[relName].data = this.rels[relName].packRefs();
                 }*/
            }
        }
        return data;
    };
    JsonApi.prototype.packResourcesListItems = function (resourceList) {
        var _this = this;
        return resourceList.items.map(function (resource) { return _this.packResource(resource); });
    };
    JsonApi.prototype.packResourceRef = function (resource) {
        return {
            id: resource.id,
            type: resource.type
        };
    };
    JsonApi.prototype.packRefData = function (value) {
        var _this = this;
        if (value instanceof resource_1.Resource) {
            return this.packResourceRef(value);
        }
        else if (value instanceof resources_lists_1.AbstractResourcesList) {
            return value.items.map(function (resource) { return _this.packResourceRef(resource); });
        }
        else if (value === null) {
            return null;
        }
        else {
            throw new Error();
        }
    };
    return JsonApi;
}());
exports.jsonApi = function (options) { return function (apme) {
    return new JsonApi(apme, options);
}; };
