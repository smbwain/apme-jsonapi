import 'source-map-support/register';

import Apme from 'apme';
import {jsonErrorHandler} from '../errors';
import {jsonApi} from '../index';
import * as Joi from 'joi';

import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as request from 'request';
import * as assert from 'assert';

const TEST_PORT = 23001;

const users = [{
    id: '1',
    name: 'Jack'
}, {
    id: '2',
    name: 'Piter'
}];


function makeRequest(path, opts?, {expectedCode = 200} = {}) : Promise<string> {
    opts = opts || {};
    return new Promise((resolve, reject) => {
        request(`http://127.0.0.1:${TEST_PORT}${path}`, opts, (err, response, body) => {
            if (err) {
                reject(err);
                return;
            }
            if (response.statusCode != expectedCode) {
                err = new Error(`Wrong status code: ${response.statusCode}`);
                err.statusCode = response.statusCode;
                reject(err);
                return;
            }
            resolve(body);
        })
    });
}
describe('basic crud', () => {

    let server;

    before('should start server', done => {
        const apme = Apme();
        apme.define('users', {
            fields: {
                name: {
                    schema: Joi.string()
                },
                lastName: {
                    schema: Joi.string()
                }
            },
            loadList: async () => (users),
            loadOne: async id => (users.find(user => user.id == id)),
            update: async (res, {data}) => {
                const index = users.findIndex(user => user.id == res.id);
                if(index == -1) {
                    return null;
                }
                users[index] = {
                    ...users[index],
                    ...data
                };
                return users[index];
            },
            passId: true,
            create: async (res, {data}) => {
                users.push({id: res.id, ...data});
                return data;
            },
            remove: async resource => {
                const index = users.findIndex(user => user.id == resource.id);
                if(index == -1) {
                    return false;
                }
                users.splice(index, 1);
                return true;
            }
        });

        const api = apme.use(jsonApi({url: '/api/'}));

        const app = express();
        app.use(bodyParser.json({
            type: req => {
                const contentType = req.get('content-type');
                return contentType == 'application/vnd.api+json' || contentType == 'application/json';
            }
        }));
        app.use(
            '/api',
            api.expressInitMiddleware(),
            api.expressJsonApiRouter({
                url: '/api/'
            }),
            jsonErrorHandler()
        );
        server = app.listen(TEST_PORT, done);
    });

    after('should close server', done => {
        server.close(done);
    });

    it('should get records list', async () => {
        const res = await makeRequest('/api/users');
        assert.deepEqual(JSON.parse(res), {
            data: [{
                id: '1',
                type: 'users',
                attributes: {
                    name: 'Jack'
                }
            }, {
                id: '2',
                type: 'users',
                attributes: {
                    name: 'Piter'
                }
            }],
            links: {
                self: '/api/users'
            }
        });
    });

    it('should get single record', async () => {
        const res = await makeRequest('/api/users/2');
        assert.deepEqual(JSON.parse(res), {
            data: {
                id: '2',
                type: 'users',
                attributes: {
                    name: 'Piter'
                }
            },
            links: { self: '/api/users/2' }
        });
    });

    it('shouldn\'t get unexisting record', async() => {
        await makeRequest('/api/users/10', {}, {
            expectedCode: 404
        });
    });

    it('should update record', async() => {
        const res = await makeRequest('/api/users/2', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/vnd.api+json'
            },
            body: JSON.stringify({
                data: {
                    attributes: {
                        lastName: 'Watson'
                    }
                }
            })
        });
        assert.deepEqual(JSON.parse(res), {
            data: {
                id: '2',
                type: 'users',
                attributes: {
                    name: 'Piter',
                    lastName: 'Watson'
                }
            },
            links: { self: '/api/users/2' }
        });
    });

    it('shouldn\'t update unexisting record', async() => {
        await makeRequest('/api/users/10', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/vnd.api+json'
            },
            body: JSON.stringify({
                data: {
                    attributes: {
                        lastName: 'Watson'
                    }
                }
            })
        }, {
            expectedCode: 404
        });
    });

    it('should create record', async() => {
        const res = await makeRequest('/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/vnd.api+json'
            },
            body: JSON.stringify({
                data: {
                    id: '7',
                    attributes: {
                        name: 'Joan'
                    }
                }
            })
        });
        assert.deepEqual(JSON.parse(res), {
            data: {
                id: '7',
                type: 'users',
                attributes: {
                    name: 'Joan'
                }
            },
            links: { self: '/api/users/7' }
        });
    });

    it('should delete record', async() => {
        await makeRequest('/api/users/1', {
            method: 'DELETE'
        }, {
            expectedCode: 204
        });
    });

    it('shouldn\'t delete unexisting record', async() => {
        await makeRequest('/api/users/10', {
            method: 'DELETE'
        }, {
            expectedCode: 404
        });
    });
});