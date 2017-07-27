import 'source-map-support/register';

import Apme from 'apme';
import {jsonErrorHandler} from '../errors';
import {jsonApi} from '../index';

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
}, {
    id: '3',
    name: 'Author 1'
}, {
    id: '4',
    name: 'Author 2'
}, {
    id: '5',
    name: 'Author 3'
}];

const books : Array<{
    id: string,
    name: string,
    authors?: number[],
    ownerId?: string
}> = [{
    id: 'good-parts',
    name: 'Good parts',
    authors: [3, 5],
    ownerId: '1'
}, {
    id: 'better-parts',
    name: 'Better parts',
    ownerId: '2'
}, {
    id: 'foo',
    name: 'Foo',
    ownerId: '1',
    authors: [4]
}, {
    id: 'one-more-book',
    name: 'One more book'
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
        });
    });
}
describe('rels', () => {

    let server;

    before(done => {
        const apme = Apme();
        apme.define('users', {
            loadList: async () => (users),
            loadOne: async id => (users.find(user => user.id == id)),
            rels: {
                ownedBooks: {
                    toMany: 'books',
                    getFilterOne: resource => ({
                        ownerId: resource.id
                    })
                }
            }
        });
        apme.define('books', {
            packAttrs: ({name}) => ({name}),
            loadList: async ({filter: {ownerId = ''} = {}}) => (
                books.filter(book => !ownerId || book.ownerId == ownerId)
            ),
            loadOne: async id => (books.find(user => user.id == id)),
            rels: {
                owner: {
                    toOne: 'users',
                    getIdOne: resource => resource.data.ownerId
                },
                authors: {
                    toMany: 'users',
                    getIdsOne: resource => resource.data.authors || []
                }
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
            }), jsonErrorHandler()
        );
        server = app.listen(TEST_PORT, done);
    });

    after(done => {
        server.close(done);
    });

    it('should get book\'s owner link', async () => {
        const res = await makeRequest('/api/books/better-parts/relationships/owner');
        assert.deepEqual(JSON.parse(res), {
            "data": {
                "id": "2",
                "type": "users"
            },
            "links": {
                self: '/api/books/better-parts/relationships/owner',
                related: '/api/books/better-parts/owner'
            }
        });
    });

    it('should get book\'s owner object', async () => {
        const res = await makeRequest('/api/books/better-parts/owner');
        assert.deepEqual(JSON.parse(res), {
            "data": {
                "id": "2",
                "type": "users",
                "attributes": {
                    "name": "Piter"
                },
                "relationships": {
                    "ownedBooks": {
                        "data": [{
                            "type": "books",
                            "id": "better-parts"
                        }],
                        "links": {
                            "self": "/api/users/2/relationships/ownedBooks"
                        }
                    }
                }
            },
            "links": {
                "self": "/api/books/better-parts/owner"
            }
        });
    });

    it('should get owned links', async () => {
        const res = await makeRequest('/api/users/1/relationships/ownedBooks');
        assert.deepEqual(JSON.parse(res), {
            "data": [{
                "id": "good-parts",
                "type": "books"
            }, {
                "id": "foo",
                "type": "books"
            }],
            "links": {
                "related": "/api/users/1/ownedBooks",
                "self": "/api/users/1/relationships/ownedBooks"
            }
        });
    });

    it('should get owned objects', async () => {
        const res = await makeRequest('/api/users/1/ownedBooks');
        assert.deepEqual(JSON.parse(res), {
            "data": [{
                "id": "good-parts",
                "type": "books",
                "attributes": {
                    "name": "Good parts"
                },
                "relationships": {
                    "authors": {
                        "data": [
                            {
                                "id": 3,
                                "type": "users"
                            },
                            {
                                "id": 5,
                                "type": "users"
                            }
                        ],
                        "links": {
                            "self": "/api/books/good-parts/relationships/authors"
                        }
                    },
                    "owner": {
                        "data": {
                            "id": "1",
                            "type": "users"
                        },
                        "links": {
                            "self": "/api/books/good-parts/relationships/owner"
                        }
                    }
                }
            }, {
                "id": "foo",
                "type": "books",
                "attributes": {
                    "name": "Foo"
                },
                "relationships": {
                    "authors": {
                        "data": [
                            {
                                "id": 4,
                                "type": "users"
                            }
                        ],
                        "links": {
                            "self": "/api/books/foo/relationships/authors"
                        }
                    },
                    "owner": {
                        "data": {
                            "id": "1",
                            "type": "users"
                        },
                        "links": {
                            "self": "/api/books/foo/relationships/owner"
                        }
                    }
                }
            }],
            "links": {
                "self": "/api/users/1/ownedBooks"
            }
        });
    });

    it('should get books with owners', async () => {
        const res = await makeRequest('/api/books?include=owner');
        assert.deepEqual(JSON.parse(res), {
            "data": [{
                id: 'good-parts',
                type: 'books',
                attributes: {
                    name: 'Good parts'
                },
                relationships: {
                    "authors": {
                        "data": [
                            {
                                "id": 3,
                                "type": "users"
                            },
                            {
                                "id": 5,
                                "type": "users"
                            }
                        ],
                        "links": {
                            "self": "/api/books/good-parts/relationships/authors"
                        }
                    },
                    owner: {
                        data: {
                            type: 'users',
                            id: '1'
                        },
                        "links": {
                            "self": "/api/books/good-parts/relationships/owner"
                        }
                    }
                }
            }, {
                id: 'better-parts',
                type: 'books',
                attributes: {
                    name: 'Better parts'
                },
                relationships: {
                    "authors": {
                        "data": [],
                        "links": {
                            "self": "/api/books/better-parts/relationships/authors"
                        }
                    },
                    owner: {
                        data: {
                            type: 'users',
                            id: '2'
                        },
                        "links": {
                            "self": "/api/books/better-parts/relationships/owner"
                        }
                    }
                }
            }, {
                id: 'foo',
                type: 'books',
                attributes: {
                    name: 'Foo'
                },
                relationships: {
                    "authors": {
                        "data": [
                            {
                                "id": 4,
                                "type": "users"
                            }
                        ],
                        "links": {
                            "self": "/api/books/foo/relationships/authors"
                        }
                    },
                    owner: {
                        data: {
                            type: 'users',
                            id: '1'
                        },
                        "links": {
                            "self": "/api/books/foo/relationships/owner"
                        }
                    }
                }
            }, {
                "attributes": {
                    "name": "One more book"
                },
                "id": "one-more-book",
                "relationships": {
                    "authors": {
                        "data": [],
                        "links": {
                            "self": "/api/books/one-more-book/relationships/authors"
                        }
                    },
                    "owner": {
                        "data": null,
                        "links": {
                            "self": "/api/books/one-more-book/relationships/owner"
                        }
                    }
                },
                "type": "books"
            }],
            "included": [{
                "id": "1",
                "type": "users",
                "attributes": {
                    "name": "Jack"
                },
                "relationships": {
                    "ownedBooks": {
                        "data": [
                            {
                                "id": "good-parts",
                                "type": "books"
                            },
                            {
                                "id": "foo",
                                "type": "books"
                            }
                        ],
                        "links": {
                            "self": "/api/users/1/relationships/ownedBooks"
                        }
                    }
                }
            }, {
                "id": "2",
                "type": "users",
                "attributes": {
                    "name": "Piter"
                },
                "relationships": {
                    "ownedBooks": {
                        "data": [
                            {
                                "id": "better-parts",
                                "type": "books"
                            }
                        ],
                        "links": {
                            "self": "/api/users/2/relationships/ownedBooks"
                        }
                    }
                }
            }],
            links: {
                "self": "/api/books?include=owner"
            }
        });
    });

    /*it('shouldn\'t get single record (403)', async () => {
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
                },
                links: { self: '/users/2' }
            }
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
                },
                links: { self: '/users/2' }
            }
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
                },
                links: { self: '/users/7' }
            }
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

    */

});