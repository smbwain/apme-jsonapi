import 'source-map-support/register';

import Apme from 'apme';
import {jsonApi, jsonErrorHandler} from '../index';

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
describe('simple perms', () => {

    let server;

    before('should start server', done => {
        const apme = Apme();
        apme.define('users', {
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
            },
            perms: {
                read: {
                    byContext: context => {
                        return !!(context.req && context.req.user);
                    }
                },
                write: ({resource, context}) => {
                    return !!(context.req && context.req.user && (context.req.user.id == '999' || context.req.user.id == resource.id));
                }
            }
        });

        const api = apme.use(jsonApi({url: '/api/'}));

        const app = express();
        app.use((req, res, next) => {
            const id = req.get('x-user');
            if(id) {
                (req as any).user = {
                    id
                };
            }
            next();
        });
        app.use(bodyParser.json({
            type: req => {
                const contentType = req.get('content-type');
                return contentType == 'application/vnd.api+json' || contentType == 'application/json';
            }
        }));
        app.use(
            '/api',
            api.expressInitMiddleware(),
            api.expressJsonApiRouter(),
            jsonErrorHandler()
        );
        server = app.listen(TEST_PORT, done);
    });

    after('should close server', done => {
        server.close(done);
    });

    it('shouldn\'t get records list (403)', async () => {
        await makeRequest('/api/users', {}, {
            expectedCode: 403
        });
    });

    it('should get records list', async () => {
        const res = await makeRequest('/api/users', {
            headers: {
                'x-user': '1'
            }
        });
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
            "links": {
                "self": "/api/users"
            }
        });
    });

    it('shouldn\'t get single record (403)', async () => {
        await makeRequest('/api/users/2', {}, {
            expectedCode: 403
        });
    });

    it('should get single record', async () => {
        const res = await makeRequest('/api/users/2', {
            headers: {
                'x-user': '1'
            }
        });
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

    it('shouldn\'t get unexisting record (403)', async() => {
        await makeRequest('/api/users/10', {}, {
            expectedCode: 403
        });
    });

    it('shouldn\'t get unexisting record (404)', async() => {
        await makeRequest('/api/users/10', {
            headers: {
                'x-user': '1'
            }
        }, {
            expectedCode: 404
        });
    });

    it('shouldn\'t update record 1', async() => {
        await makeRequest('/api/users/2', {
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
            expectedCode: 403
        });
    });

    it('shouldn\'t update record 2', async() => {
        await makeRequest('/api/users/2', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/vnd.api+json',
                'X-User': 1
            },
            body: JSON.stringify({
                data: {
                    attributes: {
                        lastName: 'Watson'
                    }
                }
            })
        }, {
            expectedCode: 403
        });
    });

    it('should update record', async() => {
        const res = await makeRequest('/api/users/2', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/vnd.api+json',
                'X-User': 2
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

    it('shouldn\'t update unexisting record (403)', async() => {
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
            expectedCode: 403
        });
    });

    it('shouldn\'t update unexisting record (404)', async() => {
        await makeRequest('/api/users/10', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/vnd.api+json',
                'X-User': 10
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

    it('shouldn\'t create record', async() => {
        await makeRequest('/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/vnd.api+json',
                'X-User': 8
            },
            body: JSON.stringify({
                data: {
                    id: '7',
                    attributes: {
                        name: 'Joan'
                    }
                }
            })
        }, {
            expectedCode: 403
        });
    });

    it('should create record', async() => {
        const res = await makeRequest('/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/vnd.api+json',
                'X-User': 999
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

    it('shouldn\'t delete record 1', async() => {
        await makeRequest('/api/users/1', {
            method: 'DELETE'
        }, {
            expectedCode: 403
        });
    });

    it('shouldn\'t delete record 2', async() => {
        await makeRequest('/api/users/1', {
            method: 'DELETE',
            headers: {
                'X-User': 2
            }
        }, {
            expectedCode: 403
        });
    });

    it('should delete record', async() => {
        await makeRequest('/api/users/1', {
            method: 'DELETE',
            headers: {
                'X-User': 1
            }
        }, {
            expectedCode: 204
        });
    });

    it('shouldn\'t delete unexisting record (403)', async() => {
        await makeRequest('/api/users/10', {
            method: 'DELETE'
        }, {
            expectedCode: 403
        });
    });

    it('shouldn\'t delete unexisting record (404)', async() => {
        await makeRequest('/api/users/10', {
            method: 'DELETE',
            headers: {
                'X-User': 10
            }
        }, {
            expectedCode: 404
        });
    });
});