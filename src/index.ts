
import * as asyncMW from 'async-mw';
import * as querystring from 'querystring';
import {ApmeInterface, ResourceInterface, ListInterface, CollectionInterface, ContextInterface, RelationLink} from 'apme';
import {badRequestError, notFoundError} from './errors';
import {validate} from './validate';
import * as Joi from 'joi';

function parseFields(fields) {
    const res = {};
    if(fields) {
        validate(fields, schemas.fields, 'Fields validation');
        for (const collectionName in fields) {
            res[collectionName] = new Set(fields[collectionName].split(','));
        }
    }
    return res;
}

function parseInclude(includeString) {
    if(!includeString) {
        return null;
    }
    validate(includeString, schemas.include, 'Include validation');
    const res = {};
    for(const includeElement of includeString.split(',')) {
        let curObj = res;
        for(const current of includeElement.split('.')) {
            curObj = curObj[current] || (curObj[current] = {});
        }
    }
    return res;
}

const schemas : any = {};
{
    const rel = Joi.object().unknown(false).keys({
        id: Joi.string().required(),
        type: Joi.string().required()
    });
    schemas.relationship = Joi.object().unknown(false).keys({
        data: Joi.alternatives().required().try(
            Joi.array().items(rel),
            rel
        )
    });
    schemas.relationshipToMany = Joi.object().unknown(false).keys({
        data: Joi.array().items(rel)
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

class JsonApi {
    private apme : ApmeInterface;
    private url : string;

    constructor(apme: ApmeInterface, {url = '/'} : {url?: string} = {}) {
        this.apme = apme;
        this.url = url;
    }

    urlBuilder(path : string, params?) {
        return this.url+path+((params && Object.keys(params).length) ? '?'+querystring.stringify(params) : '');
    }

    expressInitMiddleware() : any {
        return (req, res, next) => {
            req.apmeContext = this.apme.context({
                req
            });
            next();
        };
    }

    expressJsonApiRouter() : any {
        const router = require('express').Router();

        router.param('collection', (req, res, next, type) => {
            req.collection = this.apme.collection(type);
            req.type = type;
            next();
        });

        router.param('id', (req, res, next, id) => {
            req.id = id;
            next();
        });

        router.use((req, res, next) => {
            res.set('Content-Type', 'application/vnd.api+json');
            next();
        });

        const parseFieldsMiddleware = (req, res, next) => {
            const fields = parseFields(req.query.fields);
            this.validateFields(fields);
            req.apmeContext.fields = fields;

            req.include = parseInclude(req.query.include);
            next();
        };

        router.get('/:collection', parseFieldsMiddleware, asyncMW(async (req) => {
            const {type} = req;

            const {filter, sort, page} = req.query;

            const list = await req.apmeContext.list(type, {sort, page, filter}).load();
            const included = this.packResourcesListItems(await list.include(req.include));

            return {
                data: this.packResourcesListItems(list),
                meta: list.meta,
                included: included.length ? included : undefined,
                links: {
                    self: this.urlBuilder(`${type}`, req.query)
                }
            };
        }));

        router.get('/:collection/:id', asyncMW(async req => {
            const {collection} = req;
            const {type, id} = req;

            const resource = await req.apmeContext.resource(type, id).load();
            if(!resource.exists) {
                throw notFoundError();
            }

            const fields = parseFields(req.query.fields);
            const include = parseInclude(req.query.include);

            const included = this.packResourcesListItems(await resource.include(include));

            return {
                data: this.packResource(resource),
                included: included.length ? included : undefined,
                links: {
                    self: this.urlBuilder(`${type}/${id}`, req.query)
                }
            };
        }));

        const updaterMiddleware = (patch) => {
            return asyncMW(async req => {
                const {collection} = req;

                // validate basic format
                const body : any = await new Promise((resolve, reject) => {
                    Joi.validate(req.body, schemas.update, (err, value) => {
                        err ? reject(err) : resolve(value);
                    });
                });
                req.meta = body.meta || {};
                // @todo: return 400 on error

                // check type
                if(body.data.type && body.data.type != req.type) {
                    throw badRequestError('Wrong "type" passed in document');
                }

                let id = body.data.id;
                const data = collection.unpackAttrs(body.data.attributes || {}, patch);
                const passedRels = body.data.relationships || {};
                for(const relName in passedRels) {
                    const rel = collection.rels[relName];
                    if(!rel) {
                        throw badRequestError('Bad relation name');
                    }
                    const passedRelData = passedRels[relName].data;
                    let relValue;
                    if(Array.isArray(passedRelData)) {
                        relValue = passedRelData.map(data => req.apmeContext.resource(data.type, data.id));
                    } else {
                        relValue = passedRelData ? req.apmeContext.resource(passedRelData.type, passedRelData.id) : null;
                    }
                    rel.setData(data, relValue);
                }

                // fill/check id
                if(patch) {
                    if(id) {
                        if (id != req.id) {
                            throw badRequestError('Wrong "id" passed in document');
                        }
                    } else {
                        id = req.id;
                    }
                } else {
                    if(id) {
                        if(!collection.passId || (typeof collection.passId == 'function' && !(await collection.passId(req.apmeContext, id)))) {
                            throw badRequestError('Passing id is not allowed');
                        }
                    } else {
                        id = await collection.generateId(data, req.apmeContext);
                    }
                }

                const resource = req.apmeContext.resource(req.type, id);

                if(patch) {
                    await resource.update(data);
                    if(!resource.exists) {
                        throw notFoundError();
                    }
                } else {
                    await resource.create(data);
                }

                const fields = parseFields(req.query.fields);
                const include = parseInclude(req.query.include);

                const included = this.packResourcesListItems(await resource.include(include));

                return {
                    data: this.packResource(resource),
                    included: included.length ? included : undefined,
                    links: {
                        self: this.urlBuilder(`${resource.type}/${resource.id}`) // @todo: params
                    },
                    meta: Object.keys(req.apmeContext.meta).length ? req.apmeContext.meta : undefined
                };
            });
        };

        router.post('/:collection', updaterMiddleware(false));
        router.patch('/:collection/:id', updaterMiddleware(true));

        router.delete('/:collection/:id', asyncMW(async (req, res) => {
            if(!await req.apmeContext.resource(req.type, req.id).remove()) {
                throw notFoundError();
            }

            res.status(204).send();
            return null;
        }));

        router.get('/:collection/:id/:relName', asyncMW(async req => {
            const {collection} = req;
            const {type, id} = req;
            const {relName} = req.params;

            const rel = collection.rels[relName];
            if(!rel) {
                throw notFoundError('No relation with such name');
            }

            const mainResource = await req.apmeContext.resource(type, id).load();
            if(!mainResource.exists) {
                throw notFoundError();
            }

            const fields = parseFields(req.query.fields);

            let data = null;
            if(rel.toOne) {
                const resource = await rel.getResourceOne(mainResource);
                if(resource) {
                    await resource.load();
                    if(resource.exists) {
                        data = this.packResource(resource);
                    }
                }
            } else {
                const list = await rel.getListOne(mainResource);
                await list.load();
                data = this.packResourcesListItems(list);
            }

            // @todo: add included

            return {
                data,
                links: {
                    self: this.urlBuilder(`${type}/${id}/${relName}`)
                }
            };

            // const include = req.query.include && req.collection.parseInclude(req.query.include);
            // const included = (await resource.include(include)).packItems(fields);

            /*return {
             data: mainResource.pack(fields[type])
             //included: included.length ? included : undefined
             };*/


            // @todo
            /*const rel = req.collection.rels[req.params.relName];
             if(!rel) {
             throw notFoundError('No relation with such name');
             }*/

            /*if(req.query.include) {
             req.apmeContext.include = parseInclude(req.query.include);
             }*/

            /*const mainData = (await req.collection.loadByIdsAndPack([req.params.id], req.apmeContext))[0];
             if(!mainData) {
             throw notFoundError();
             }

             const data = await loadAllRelationships(this, {
             ...req.apmeContext,
             include: {
             [req.params.relName]: {}
             }
             }, [mainData]);

             return {
             data: (rel.getId || rel.getOne) ? data[0] || null : data,
             included: await loadAllRelationships(this, req.apmeContext, data)
             };*/
        }));

        router.get('/:collection/:id/relationships/:relName', asyncMW(async req => {
            const collection : CollectionInterface = req.collection;
            const {type, id} : {type: string, id: string} = req;
            const relName : string = req.params.relName;
            const context : ContextInterface = req.apmeContext;

            const rel = collection.rels[relName];
            if(!rel) {
                throw notFoundError('No relation with such name');
            }

            const mainResource = await context.resource(type, id).load();
            if(!mainResource.exists) {
                throw notFoundError();
            }

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

            return {
                data: this.packRefData(await rel.getOne(mainResource)),
                links: {
                    self: this.urlBuilder(`${type}/${id}/relationships/${relName}`),
                    related: this.urlBuilder(`${type}/${id}/${relName}`)
                }
            };
        }));

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
    }

    private validateFields(fields: {[name: string]: Iterable<string>}) : void {
        for(const collectionName in fields) {
            const collection = this.apme.collection(collectionName);
            if(!collection) {
                throw badRequestError(`Unknown collection ${collectionName}`);
            }
            if(collection.fieldsToGet) {
                for(const fieldName of fields[collectionName]) {
                    if(!collection.fieldsToGet.has(fieldName)) {
                        throw badRequestError(`Unknown attribute or relationship "${collectionName}"."${fieldName}"`);
                    }
                }
            }
        }
    }

    private packResource(resource : ResourceInterface.Readable) : any {
        const collection = this.apme.collection(resource.type);
        const data : any = {
            id: resource.id,
            type: resource.type,
            attributes: collection.packAttrs(resource.data, resource.context.fields[resource.type])
            /*links: {
                self: this.urlBuilder(`${resource.type}/${resource.id}`)
            }*/
        };
        if(Object.keys(collection.rels).length) {
            data.relationships = {};
            for(const relName in collection.rels) {
                /*if(fields && !fields[relName]) {
                 continue;
                 }*/
                const relData = resource.rels[relName];
                if(relData === undefined) {
                    throw new Error(`No relationship data ${resource.type}:${relName}`);
                }
                data.relationships[relName] = {
                    data: this.packRefData(relData),
                    links: {
                        self: this.urlBuilder(`${resource.type}/${resource.id}/relationships/${relName}`)
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
    }

    private packResourcesListItems(resourceList: ListInterface.Readable) : any {
        return resourceList.items.map(resource => this.packResource(resource));
    }

    private packResourceRef(resource : ResourceInterface.Identifier) : any {
        return {
            id: resource.id,
            type: resource.type
        };
    }

    private packRefData(value : ResourceInterface.Loadable | RelationLink) : any {
        if((value as RelationLink).one) {
            return this.packResourceRef((value as RelationLink).one);
        } else if((value as RelationLink).many) {
            return ((value as RelationLink).many as ListInterface.Readable).items.map(resource => this.packResourceRef(resource));
        } else /*if(value === null)*/ {
            return null;
        } /*else {
            throw new Error();
        }*/
    }
}

export const jsonApi = options => (apme: ApmeInterface) => {
    return new JsonApi(apme, options);
};