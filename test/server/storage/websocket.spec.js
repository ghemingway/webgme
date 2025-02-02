/*globals requireJS*/
/*jshint node:true, newcap:false, mocha:true*/
/**
 * @author lattmann / https://github.com/lattmann
 * @author pmeijer / https://github.com/pmeijer
 */

var testFixture = require('../../_globals.js');

describe('WebSocket', function () {
    'use strict';
    var gmeConfig = testFixture.getGmeConfig(),
        expect = testFixture.expect,
        logger = testFixture.logger.fork('WebSocket.spec'),
        Q = testFixture.Q,
        WebGME = testFixture.WebGME,
        CONSTANTS = requireJS('common/storage/constants'),

        superagent = testFixture.superagent,

        gmeAuth,
        projectName = 'WebSocketTestProject',
        projectNameUnauthorized = 'WebSocketTestUnauthorizedProject',
        projectEmitNotification = 'guest+projectEmit',

        projects = [
            projectName,
            projectNameUnauthorized,
            'WebSocketTest_NewProject',
            'WebSocketTest_ProjectToBeDeleted',
            'WebSocketTest_PROJECT_CREATED',
            'WebSocketTest_PROJECT_DELETED',
            'WebSocketTest_BRANCH_CREATED',
            'WebSocketTest_BRANCH_DELETED',
            'WebSocketTest_BRANCH_HASH_UPDATED',
            'WebSocketTest_BRANCH_UPDATED'
        ],

        guestAccount = gmeConfig.authentication.guestAccount,
        projectName2Id = testFixture.projectName2Id,
        safeStorage,

        server,
        serverBaseUrl,
        agent,
        webgmeToken,//TODO: this is not a nice approach, but don't want change all openSocketIo

        openSocketIo = function (token, returnToken, callback) {
            return testFixture.openSocketIo(server, agent, guestAccount, guestAccount, token)
                .then(function (result) {
                    webgmeToken = result.webgmeToken;

                    if (returnToken) {
                        return {
                            socket: result.socket,
                            webgmeToken: webgmeToken
                        };
                    } else {
                        return result.socket;
                    }
                })
                .nodeify(callback);
        };


    function emitRangeWithData(socket, data) {
        return Q.allSettled([
            Q.ninvoke(socket, 'emit', 'getConnectionInfo', data),
            Q.ninvoke(socket, 'emit', 'watchDatabase', data),
            Q.ninvoke(socket, 'emit', 'watchProject', data),
            Q.ninvoke(socket, 'emit', 'watchBranch', data),
            Q.ninvoke(socket, 'emit', 'openProject', data),
            Q.ninvoke(socket, 'emit', 'closeProject', data),
            Q.ninvoke(socket, 'emit', 'openBranch', data),
            Q.ninvoke(socket, 'emit', 'closeBranch', data),
            Q.ninvoke(socket, 'emit', 'makeCommit', data),
            Q.ninvoke(socket, 'emit', 'loadObjects', data),
            Q.ninvoke(socket, 'emit', 'loadPaths', data),
            Q.ninvoke(socket, 'emit', 'setBranchHash', data),
            Q.ninvoke(socket, 'emit', 'getBranchHash', data),
            Q.ninvoke(socket, 'emit', 'getProjects', data),
            Q.ninvoke(socket, 'emit', 'deleteProject', data),
            Q.ninvoke(socket, 'emit', 'createProject', data),
            Q.ninvoke(socket, 'emit', 'transferProject', data),
            Q.ninvoke(socket, 'emit', 'duplicateProject', data),
            Q.ninvoke(socket, 'emit', 'getBranches', data),
            Q.ninvoke(socket, 'emit', 'createTag', data),
            Q.ninvoke(socket, 'emit', 'deleteTag', data),
            Q.ninvoke(socket, 'emit', 'getTags', data),
            Q.ninvoke(socket, 'emit', 'getCommits', data),
            Q.ninvoke(socket, 'emit', 'getHistory', data),
            Q.ninvoke(socket, 'emit', 'getLatestCommitData', data),
            Q.ninvoke(socket, 'emit', 'getCommonAncestorCommit', data),
            Q.ninvoke(socket, 'emit', 'simpleRequest', data),
            Q.ninvoke(socket, 'emit', 'notification', data)
        ]);
    }

    describe('with valid token as a guest user, auth turned on', function () {
        before(function (done) {
            var gmeConfigWithAuth = testFixture.getGmeConfig();
            gmeConfigWithAuth.authentication.enable = true;
            gmeConfigWithAuth.authentication.allowGuests = true;

            server = WebGME.standaloneServer(gmeConfigWithAuth);
            serverBaseUrl = server.getUrl();
            server.start(function (err) {
                if (err) {
                    done(new Error(err));
                    return;
                }

                testFixture.clearDBAndGetGMEAuth(gmeConfigWithAuth, projects)
                    .then(function (gmeAuth_) {
                        gmeAuth = gmeAuth_;
                        safeStorage = testFixture.getMongoStorage(logger, gmeConfigWithAuth, gmeAuth);

                        return Q.allDone([
                            safeStorage.openDatabase(),
                            gmeAuth.authorizeByUserId(guestAccount, 'project_does_not_exist', 'create',
                                {
                                    read: true,
                                    write: true,
                                    delete: true
                                })
                        ]);
                    })
                    .then(function () {
                        return Q.allDone([
                            gmeAuth.authorizeByUserId(guestAccount, projectNameUnauthorized, 'create',
                                {
                                    read: false,
                                    write: false,
                                    delete: false
                                }),
                            gmeAuth.authorizeByUserId(guestAccount, projectEmitNotification, 'create',
                                {
                                    read: true,
                                    write: true,
                                    delete: true
                                })
                        ]);
                    })
                    .nodeify(done);
            });
        });

        after(function (done) {
            server.stop(function (err) {
                if (err) {
                    done(new Error(err));
                    return;
                }

                Q.allDone([
                    gmeAuth.unload(),
                    safeStorage.closeDatabase()
                ])
                    .nodeify(done);
            });
        });

        beforeEach(function () {
            agent = superagent.agent();
        });

        it('should fail and not crash server when sending string data', function (done) {
            var socket;

            openSocketIo()
                .then(function (socket_) {
                    var data = 'five';
                    socket = socket_;
                    return emitRangeWithData(socket, data);
                })
                .then(function (result) {
                    result.forEach(function (res, i) {
                        if (i === 1 || i === 7) {
                            expect(res.state).to.equal('fulfilled', i);
                        } else {
                            expect(res.state).to.equal('rejected', i);
                        }
                    });

                    // Check that we can still e.g. openProject.
                    return Q.ninvoke(socket, 'emit', 'getConnectionInfo', {webgmeToken: webgmeToken});
                })
                .then(function (result) {
                    expect(result.userId).to.equal(gmeConfig.authentication.guestAccount);
                })
                .nodeify(done);
        });

        it('should fail and not crash server when sending boolean data', function (done) {
            var socket;

            openSocketIo()
                .then(function (socket_) {
                    var data = true;
                    socket = socket_;
                    return emitRangeWithData(socket, data);
                })
                .then(function (result) {
                    result.forEach(function (res, i) {
                        if (i === 1 || i === 7) {
                            expect(res.state).to.equal('fulfilled', i);
                        } else {
                            expect(res.state).to.equal('rejected', i);
                        }
                    });

                    // Check that we can still e.g. openProject.
                    return Q.ninvoke(socket, 'emit', 'getConnectionInfo', {webgmeToken: webgmeToken});
                })
                .then(function (result) {
                    expect(result.userId).to.equal(gmeConfig.authentication.guestAccount);
                })
                .nodeify(done);
        });

        it('should fail and not crash server when sending number data', function (done) {
            var socket;

            openSocketIo()
                .then(function (socket_) {
                    var data = 5;
                    socket = socket_;
                    return emitRangeWithData(socket, data);
                })
                .then(function (result) {
                    result.forEach(function (res, i) {
                        if (i === 1 || i === 7) {
                            expect(res.state).to.equal('fulfilled', i);
                        } else {
                            expect(res.state).to.equal('rejected', i);
                        }
                    });

                    // Check that we can still e.g. openProject.
                    return Q.ninvoke(socket, 'emit', 'getConnectionInfo', {webgmeToken: webgmeToken});
                })
                .then(function (result) {
                    expect(result.userId).to.equal(gmeConfig.authentication.guestAccount);
                })
                .nodeify(done);
        });

        it('should fail and not crash server when sending null data', function (done) {
            var socket;

            openSocketIo()
                .then(function (socket_) {
                    var data = null;
                    socket = socket_;
                    return emitRangeWithData(socket, data);
                })
                .then(function (result) {
                    result.forEach(function (res, i) {
                        if (i === 1 || i === 7) {
                            expect(res.state).to.equal('fulfilled', i);
                        } else {
                            expect(res.state).to.equal('rejected', i);
                        }
                    });

                    // Check that we can still e.g. openProject.
                    return Q.ninvoke(socket, 'emit', 'getConnectionInfo', {webgmeToken: webgmeToken});
                })
                .then(function (result) {
                    expect(result.userId).to.equal(gmeConfig.authentication.guestAccount);
                })
                .nodeify(done);
        });

        it('should fail and not crash server when sending undefined data', function (done) {
            var socket;

            openSocketIo()
                .then(function (socket_) {
                    var data;
                    socket = socket_;
                    return emitRangeWithData(socket, data);
                })
                .then(function (result) {
                    result.forEach(function (res, i) {
                        if (i === 1 || i === 7) {
                            expect(res.state).to.equal('fulfilled', i);
                        } else {
                            expect(res.state).to.equal('rejected', i);
                        }
                    });

                    // Check that we can still e.g. openProject.
                    return Q.ninvoke(socket, 'emit', 'getConnectionInfo', {webgmeToken: webgmeToken});
                })
                .then(function (result) {
                    expect(result.userId).to.equal(gmeConfig.authentication.guestAccount);
                })
                .nodeify(done);
        });

        it('should getConnectionInfo', function (done) {
            openSocketIo()
                .then(function (socket) {
                    return Q.ninvoke(socket, 'emit', 'getConnectionInfo', {webgmeToken: webgmeToken});
                })
                .then(function (result) {
                    expect(result.userId).to.equal(guestAccount);
                    expect(typeof result.serverVersion).to.equal('string');
                })
                .nodeify(done);
        });

        it('should fail to getConnectionInfo with malformed token', function (done) {
            openSocketIo()
                .then(function (socket) {
                    return Q.ninvoke(socket, 'emit', 'getConnectionInfo', {webgmeToken: 'malformed_token'});
                })
                .then(function () {
                    throw new Error('should have failed to getConnectionInfo');
                })
                .catch(function (err) {
                    if (typeof err === 'string' && err.indexOf('jwt malformed') > -1) {
                        return;
                    }
                    throw new Error('should have failed to getConnectionInfo: ' + err);
                })
                .nodeify(done);
        });

        it('should not emit web-token when sending addon notification', function (done) {
            var emitter,
                receiver,
                emitted = false,
                received = false;

            Q.allDone([
                openSocketIo(null, true),
                openSocketIo(null, true)
            ])
                .then(function (res) {
                    emitter = res[0];
                    receiver = res[1];

                    return Q.allDone([
                        Q.ninvoke(emitter.socket, 'emit', 'watchBranch', {
                            webgmeToken: emitter.webgmeToken,
                            join: true,
                            projectId: projectEmitNotification,
                            branchName: 'master'
                        }),
                        Q.ninvoke(receiver.socket, 'emit', 'watchBranch', {
                            webgmeToken: receiver.webgmeToken,
                            join: true,
                            projectId: projectEmitNotification,
                            branchName: 'master'
                        }),
                    ]);
                })
                .then(function () {
                    var deferred = Q.defer();
                    receiver.socket.on(CONSTANTS.NOTIFICATION, function (data) {
                        received = true;
                        expect(typeof data.webgmeToken).to.equal('undefined', 'webgmeToken transmitted!');
                        receiver.socket.removeAllListeners(CONSTANTS.NOTIFICATION);
                        if (emitted === true) {
                            deferred.resolve();
                        }
                    });

                    Q.ninvoke(emitter.socket, 'emit', 'notification', {
                        type: CONSTANTS.ADD_ON_NOTIFICATION,
                        webgmeToken: emitter.webgmeToken,
                        projectId: projectEmitNotification,
                        branchName: 'master'
                    })
                        .then(function () {
                            emitted = true;
                            if (received === true) {
                                deferred.resolve();
                            }
                        })
                        .catch(deferred.reject);

                    return deferred.promise;
                })
                .nodeify(done);
        });

        it('a socket joining/leaving a branch room should emit SOCKET_ROOM_CHANGE', function (done) {
            var emitter,
                receiver,
                emitted = false,
                received = false;

            Q.allDone([
                openSocketIo(null, true),
                openSocketIo(null, true)
            ])
                .then(function (res) {
                    emitter = res[0];
                    receiver = res[1];

                    return Q.allDone([
                        Q.ninvoke(receiver.socket, 'emit', 'watchBranch', {
                            webgmeToken: receiver.webgmeToken,
                            join: true,
                            projectId: projectEmitNotification,
                            branchName: 'master'
                        }),
                    ]);
                })
                .then(function () {
                    var deferred = Q.defer();
                    receiver.socket.on(CONSTANTS.NOTIFICATION, function (data) {
                        received = true;
                        expect(typeof data.webgmeToken).to.equal('undefined', 'webgmeToken transmitted!');
                        expect(data).to.include.keys('userId', 'socketId', 'projectId', 'branchName', 'type');
                        expect(data.type).to.equal(CONSTANTS.BRANCH_ROOM_SOCKETS);
                        expect(data.join).to.equal(true);
                        receiver.socket.removeAllListeners(CONSTANTS.NOTIFICATION);
                        if (emitted === true) {
                            deferred.resolve();
                        }
                    });

                    Q.ninvoke(emitter.socket, 'emit', 'watchBranch', {
                        webgmeToken: emitter.webgmeToken,
                        join: true,
                        projectId: projectEmitNotification,
                        branchName: 'master'
                    }).then(function () {
                        emitted = true;
                        if (received === true) {
                            deferred.resolve();
                        }
                    })
                        .catch(deferred.reject);

                    return deferred.promise;
                })
                .then(function () {
                    var deferred = Q.defer();
                    receiver.socket.on(CONSTANTS.NOTIFICATION, function (data) {
                        received = true;
                        expect(typeof data.webgmeToken).to.equal('undefined', 'webgmeToken transmitted!');
                        expect(data).to.include.keys('userId', 'socketId', 'projectId', 'branchName', 'type');
                        expect(data.type).to.equal(CONSTANTS.BRANCH_ROOM_SOCKETS);
                        expect(typeof data.join).to.equal('undefined');
                        receiver.socket.removeAllListeners(CONSTANTS.NOTIFICATION);
                        if (emitted === true) {
                            deferred.resolve();
                        }
                    });

                    Q.ninvoke(emitter.socket, 'emit', 'watchBranch', {
                        webgmeToken: emitter.webgmeToken,
                        join: false,
                        projectId: projectEmitNotification,
                        branchName: 'master'
                    }).then(function () {
                        emitted = true;
                        if (received === true) {
                            deferred.resolve();
                        }
                    })
                        .catch(deferred.reject);

                    return deferred.promise;
                })
                .nodeify(done);
        });

        it('a socket disconnecting from a branch room should emit SOCKET_ROOM_CHANGE', function (done) {
            var emitter,
                receiver;

            Q.allDone([
                openSocketIo(null, true),
                openSocketIo(null, true)
            ])
                .then(function (res) {
                    emitter = res[0];
                    receiver = res[1];

                    return Q.allDone([
                        Q.ninvoke(emitter.socket, 'emit', 'watchBranch', {
                            webgmeToken: emitter.webgmeToken,
                            join: true,
                            projectId: projectEmitNotification,
                            branchName: 'master'
                        })
                    ]);
                })
                .then(function () {
                    return Q.allDone([
                        Q.ninvoke(receiver.socket, 'emit', 'watchBranch', {
                            webgmeToken: receiver.webgmeToken,
                            join: true,
                            projectId: projectEmitNotification,
                            branchName: 'master'
                        })
                    ]);
                })
                .then(function () {
                    var deferred = Q.defer();
                    receiver.socket.on(CONSTANTS.NOTIFICATION, function (data) {
                        expect(typeof data.webgmeToken).to.equal('undefined', 'webgmeToken transmitted!');
                        expect(data).to.include.keys('userId', 'socketId', 'projectId', 'branchName', 'type');
                        expect(data.type).to.equal(CONSTANTS.BRANCH_ROOM_SOCKETS);
                        expect(typeof data.join).to.equal('undefined');
                        receiver.socket.removeAllListeners(CONSTANTS.NOTIFICATION);
                        deferred.resolve();
                    });

                    emitter.socket.disconnect();

                    return deferred.promise;
                })
                .nodeify(done);
        });

        it('PLUGIN_NOTIFICATION should be broadcast to originalSocketId', function (done) {
            var emitter,
                receiver,
                middle,
                emitted = false,
                received = false;

            Q.allDone([
                openSocketIo(null, true),
                openSocketIo(null, true),
                openSocketIo(null, true)
            ])
                .then(function (res) {
                    emitter = res[0];
                    receiver = res[1];
                    middle = res[2];

                    return Q.allDone([
                        Q.ninvoke(emitter.socket, 'emit', 'watchBranch', {
                            webgmeToken: emitter.webgmeToken,
                            join: true,
                            projectId: projectEmitNotification,
                            branchName: 'master'
                        }),
                        Q.ninvoke(receiver.socket, 'emit', 'watchBranch', {
                            webgmeToken: receiver.webgmeToken,
                            join: true,
                            projectId: projectEmitNotification,
                            branchName: 'master'
                        }),
                        Q.ninvoke(middle.socket, 'emit', 'watchBranch', {
                            webgmeToken: middle.webgmeToken,
                            join: true,
                            projectId: projectEmitNotification,
                            branchName: 'master'
                        }),
                    ]);
                })
                .then(function () {
                    var deferred = Q.defer();
                    middle.socket.on(CONSTANTS.NOTIFICATION, function (data) {
                        if (data.type === CONSTANTS.PLUGIN_NOTIFICATION) {
                            deferred.reject(new Error('Middle got plugin notification!'));
                        }
                    });

                    receiver.socket.on(CONSTANTS.NOTIFICATION, function (data) {
                        if (data.type === CONSTANTS.PLUGIN_NOTIFICATION) {
                            received = true;
                            expect(typeof data.webgmeToken).to.equal('undefined', 'webgmeToken transmitted!');
                            receiver.socket.removeAllListeners(CONSTANTS.NOTIFICATION);
                            if (emitted === true) {
                                deferred.resolve();
                            }
                        }
                    });

                    Q.ninvoke(emitter.socket, 'emit', 'notification', {
                        type: CONSTANTS.PLUGIN_NOTIFICATION,
                        webgmeToken: emitter.webgmeToken,
                        projectId: projectEmitNotification,
                        branchName: 'master',
                        originalSocketId: receiver.socket.id,
                        notification: {
                            message: 'hej'
                        }
                    })
                        .then(function () {
                            emitted = true;
                            if (received === true) {
                                deferred.resolve();
                            }
                        })
                        .catch(deferred.reject);

                    return deferred.promise;
                })
                .nodeify(done);
        });

        it('PLUGIN_NOTIFICATION should be broadcast to branch-room if toBranch=true', function (done) {
            var emitter,
                receiver,
                middle,
                emitted = false,
                received = 0;

            Q.allDone([
                openSocketIo(null, true),
                openSocketIo(null, true),
                openSocketIo(null, true)
            ])
                .then(function (res) {
                    emitter = res[0];
                    receiver = res[1];
                    middle = res[2];

                    return Q.allDone([
                        Q.ninvoke(emitter.socket, 'emit', 'watchBranch', {
                            webgmeToken: emitter.webgmeToken,
                            join: true,
                            projectId: projectEmitNotification,
                            branchName: 'master'
                        }),
                        Q.ninvoke(receiver.socket, 'emit', 'watchBranch', {
                            webgmeToken: receiver.webgmeToken,
                            join: true,
                            projectId: projectEmitNotification,
                            branchName: 'master'
                        }),
                        Q.ninvoke(middle.socket, 'emit', 'watchBranch', {
                            webgmeToken: middle.webgmeToken,
                            join: true,
                            projectId: projectEmitNotification,
                            branchName: 'master'
                        }),
                    ]);
                })
                .then(function () {
                    var deferred = Q.defer();
                    middle.socket.on(CONSTANTS.NOTIFICATION, function (data) {
                        if (data.type === CONSTANTS.PLUGIN_NOTIFICATION) {
                            received += 1;
                            expect(typeof data.webgmeToken).to.equal('undefined', 'webgmeToken transmitted!');
                            middle.socket.removeAllListeners(CONSTANTS.NOTIFICATION);
                            if (emitted === true && received === 2) {
                                deferred.resolve();
                            }
                        }
                    });

                    receiver.socket.on(CONSTANTS.NOTIFICATION, function (data) {
                        if (data.type === CONSTANTS.PLUGIN_NOTIFICATION) {
                            received += 1;
                            expect(typeof data.webgmeToken).to.equal('undefined', 'webgmeToken transmitted!');
                            receiver.socket.removeAllListeners(CONSTANTS.NOTIFICATION);
                            if (emitted === true && received === 2) {
                                deferred.resolve();
                            }
                        }
                    });

                    Q.ninvoke(emitter.socket, 'emit', 'notification', {
                        type: CONSTANTS.PLUGIN_NOTIFICATION,
                        webgmeToken: emitter.webgmeToken,
                        projectId: projectEmitNotification,
                        branchName: 'master',
                        originalSocketId: receiver.socket.id,
                        notification: {
                            message: 'hej',
                            toBranch: true
                        }
                    })
                        .then(function () {
                            emitted = true;
                            if (received === 2) {
                                deferred.resolve();
                            }
                        })
                        .catch(deferred.reject);

                    return deferred.promise;
                })
                .nodeify(done);
        });

        it('PLUGIN_NOTIFICATION should fail if no originalSocketId provided', function (done) {
            var emitter,
                receiver;

            Q.allDone([
                openSocketIo(null, true),
                openSocketIo(null, true)
            ])
                .then(function (res) {
                    emitter = res[0];
                    receiver = res[1];

                    return Q.allDone([
                        Q.ninvoke(emitter.socket, 'emit', 'watchBranch', {
                            webgmeToken: emitter.webgmeToken,
                            join: true,
                            projectId: projectEmitNotification,
                            branchName: 'master'
                        }),
                        Q.ninvoke(receiver.socket, 'emit', 'watchBranch', {
                            webgmeToken: receiver.webgmeToken,
                            join: true,
                            projectId: projectEmitNotification,
                            branchName: 'master'
                        }),
                    ]);
                })
                .then(function () {
                    var deferred = Q.defer();

                    Q.ninvoke(emitter.socket, 'emit', 'notification', {
                        type: CONSTANTS.PLUGIN_NOTIFICATION,
                        webgmeToken: emitter.webgmeToken,
                        projectId: projectEmitNotification,
                        branchName: 'master',
                        notification: {
                            message: 'hej'
                        }
                    })
                        .then(function () {
                            throw new Error('Should have failed!');
                        })
                        .catch(function (err) {
                            try {
                                err = err instanceof Error ? err : new Error(err);
                                expect(err.message).to.include('PLUGIN_NOTIFICATION ' +
                                    'requires provided originalSocketId');
                                deferred.resolve();
                            } catch (e) {
                                deferred.reject(e);
                            }
                        })
                        .done();

                    return deferred.promise;
                })
                .nodeify(done);
        });
    });

    describe('with valid token as a guest user', function () {
        var ir;

        before(function (done) {
            server = WebGME.standaloneServer(gmeConfig);
            serverBaseUrl = server.getUrl();
            server.start(function (err) {
                if (err) {
                    done(new Error(err));
                    return;
                }

                testFixture.clearDBAndGetGMEAuth(gmeConfig, projects)
                    .then(function (gmeAuth_) {
                        gmeAuth = gmeAuth_;
                        safeStorage = testFixture.getMongoStorage(logger, gmeConfig, gmeAuth);

                        return Q.allDone([
                            safeStorage.openDatabase(),
                            gmeAuth.authorizeByUserId(guestAccount, 'project_does_not_exist', 'create',
                                {
                                    read: true,
                                    write: true,
                                    delete: true
                                })
                        ]);
                    })
                    .then(function () {
                        return Q.allDone([
                            testFixture.importProject(safeStorage, {
                                projectSeed: 'seeds/EmptyProject.webgmex',
                                projectName: projectName,
                                gmeConfig: gmeConfig,
                                logger: logger
                            }),
                            testFixture.importProject(safeStorage, {
                                projectSeed: 'seeds/EmptyProject.webgmex',
                                projectName: projectNameUnauthorized,
                                gmeConfig: gmeConfig,
                                logger: logger
                            }),
                            testFixture.importProject(safeStorage, {
                                projectSeed: 'seeds/EmptyProject.webgmex',
                                projectName: 'WebSocketTest_BRANCH_CREATED',
                                gmeConfig: gmeConfig,
                                logger: logger
                            }),
                            testFixture.importProject(safeStorage, {
                                projectSeed: 'seeds/EmptyProject.webgmex',
                                projectName: 'WebSocketTest_BRANCH_DELETED',
                                gmeConfig: gmeConfig,
                                logger: logger
                            }),
                            testFixture.importProject(safeStorage, {
                                projectSeed: 'seeds/EmptyProject.webgmex',
                                projectName: 'WebSocketTest_BRANCH_HASH_UPDATED',
                                gmeConfig: gmeConfig,
                                logger: logger
                            }),
                            testFixture.importProject(safeStorage, {
                                projectSeed: 'seeds/EmptyProject.webgmex',
                                projectName: 'WebSocketTest_BRANCH_UPDATED',
                                gmeConfig: gmeConfig,
                                logger: logger
                            })
                        ]);
                    })
                    .then(function (result) {
                        ir = result[4];
                        return Q.allDone([
                            gmeAuth.authorizeByUserId(guestAccount, projectName2Id(projectNameUnauthorized), 'create',
                                {
                                    read: false,
                                    write: false,
                                    delete: false
                                }),
                            ir.project.makeCommit(null, [ir.commitHash], ir.rootHash, {}, 'init')
                        ]);
                    })
                    .then(function (result) {
                        ir.commitHash2 = result[1].hash;
                    })
                    .nodeify(done);
            });
        });

        after(function (done) {
            server.stop(function (err) {
                if (err) {
                    done(new Error(err));
                    return;
                }

                Q.allDone([
                    gmeAuth.unload(),
                    safeStorage.closeDatabase()
                ])
                    .nodeify(done);
            });
        });

        beforeEach(function () {
            agent = superagent.agent();
        });

        it('should fail and not crash server when sending string data', function (done) {
            var socket;

            openSocketIo()
                .then(function (socket_) {
                    var data = 'five';
                    socket = socket_;
                    return emitRangeWithData(socket, data);
                })
                .then(function (result) {
                    result.forEach(function (res, i) {
                        var shouldSucceed = [
                            0, 1, 2, 3, 7
                        ];
                        if (shouldSucceed.indexOf(i) > -1) {
                            expect(res.state).to.equal('fulfilled', i);
                        } else {
                            expect(res.state).to.equal('rejected', i);
                        }
                    });

                    // Check that we can still e.g. openProject.
                    return Q.ninvoke(socket, 'emit', 'getConnectionInfo', {webgmeToken: webgmeToken});
                })
                .then(function (result) {
                    expect(result.userId).to.equal(gmeConfig.authentication.guestAccount);
                })
                .nodeify(done);
        });

        it('should fail and not crash server when sending boolean data', function (done) {
            var socket;

            openSocketIo()
                .then(function (socket_) {
                    var data = true;
                    socket = socket_;
                    return emitRangeWithData(socket, data);
                })
                .then(function (result) {
                    result.forEach(function (res, i) {
                        var shouldSucceed = [
                            0, 1, 2, 3, 7
                        ];
                        if (shouldSucceed.indexOf(i) > -1) {
                            expect(res.state).to.equal('fulfilled', i);
                        } else {
                            expect(res.state).to.equal('rejected', i);
                        }
                    });

                    // Check that we can still e.g. openProject.
                    return Q.ninvoke(socket, 'emit', 'getConnectionInfo', {webgmeToken: webgmeToken});
                })
                .then(function (result) {
                    expect(result.userId).to.equal(gmeConfig.authentication.guestAccount);
                })
                .nodeify(done);
        });

        it('should fail and not crash server when sending number data', function (done) {
            var socket;

            openSocketIo()
                .then(function (socket_) {
                    var data = 5;
                    socket = socket_;
                    return emitRangeWithData(socket, data);
                })
                .then(function (result) {
                    result.forEach(function (res, i) {
                        var shouldSucceed = [
                            0, 1, 2, 3, 7
                        ];
                        if (shouldSucceed.indexOf(i) > -1) {
                            expect(res.state).to.equal('fulfilled', i);
                        } else {
                            expect(res.state).to.equal('rejected', i);
                        }
                    });

                    // Check that we can still e.g. openProject.
                    return Q.ninvoke(socket, 'emit', 'getConnectionInfo', {webgmeToken: webgmeToken});
                })
                .then(function (result) {
                    expect(result.userId).to.equal(gmeConfig.authentication.guestAccount);
                })
                .nodeify(done);
        });

        it('should fail and not crash server when sending null data', function (done) {
            var socket;

            openSocketIo()
                .then(function (socket_) {
                    var data = null;
                    socket = socket_;
                    return emitRangeWithData(socket, data);
                })
                .then(function (result) {
                    result.forEach(function (res, i) {
                        var shouldSucceed = [
                            0, 1, 2, 3, 7
                        ];
                        if (shouldSucceed.indexOf(i) > -1) {
                            expect(res.state).to.equal('fulfilled', i);
                        } else {
                            expect(res.state).to.equal('rejected', i);
                        }
                    });

                    // Check that we can still e.g. openProject.
                    return Q.ninvoke(socket, 'emit', 'getConnectionInfo', {webgmeToken: webgmeToken});
                })
                .then(function (result) {
                    expect(result.userId).to.equal(gmeConfig.authentication.guestAccount);
                })
                .nodeify(done);
        });

        it('should fail and not crash server when sending undefined data', function (done) {
            var socket;

            openSocketIo()
                .then(function (socket_) {
                    var data;
                    socket = socket_;
                    return emitRangeWithData(socket, data);
                })
                .then(function (result) {
                    result.forEach(function (res, i) {
                        var shouldSucceed = [
                            0, 1, 2, 3, 7
                        ];
                        if (shouldSucceed.indexOf(i) > -1) {
                            expect(res.state).to.equal('fulfilled', i);
                        } else {
                            expect(res.state).to.equal('rejected', i);
                        }
                    });

                    // Check that we can still e.g. openProject.
                    return Q.ninvoke(socket, 'emit', 'getConnectionInfo', {webgmeToken: webgmeToken});
                })
                .then(function (result) {
                    expect(result.userId).to.equal(gmeConfig.authentication.guestAccount);
                })
                .nodeify(done);
        });

        it('should getConnectionInfo', function (done) {
            openSocketIo()
                .then(function (socket) {
                    return Q.ninvoke(socket, 'emit', 'getConnectionInfo', {webgmeToken: webgmeToken});
                })
                .then(function (result) {
                    expect(result.userId).to.equal(guestAccount);
                    expect(typeof result.serverVersion).to.equal('string');
                    done();
                })
                .catch(function (err) {
                    done(new Error(err));
                });
        });

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Project related tests

        it('should getProjects', function (done) {
            openSocketIo()
                .then(function (socket) {
                    var data = {};

                    return Q.ninvoke(socket, 'emit', 'getProjects', data);
                })
                .then(function (result) {
                    expect(result.length).to.greaterThan(1);
                    // TODO: add more specific check for the actual project existence
                    done();
                })
                .catch(function (err) {
                    done(new Error(err));
                });
        });


        it('should getProjects and branches', function (done) {
            openSocketIo()
                .then(function (socket) {
                    var data = {
                        branches: true
                    };

                    return Q.ninvoke(socket, 'emit', 'getProjects', data);
                })
                .then(function (result) {
                    expect(result.length).to.equal(5);
                    expect(result[0].branches).to.have.property('master');
                    done();
                })
                .catch(function (err) {
                    done(new Error(err));
                });
        });

        it('should createProject', function (done) {
            var data = {
                projectName: 'WebSocketTest_NewProject'
            };

            openSocketIo()
                .then(function (socket) {
                    return Q.ninvoke(socket, 'emit', 'createProject', data);
                })
                .then(function () {
                    done();
                })
                .catch(function (err) {
                    done(new Error(err));
                });
        });

        it('should create and delete a project', function (done) {
            var socket,
                data = {
                    projectName: 'WebSocketTest_ProjectToBeDeleted'
                };

            openSocketIo()
                .then(function (socket_) {
                    socket = socket_;
                    return Q.ninvoke(socket, 'emit', 'createProject', data);
                })
                .then(function (projectId) {
                    expect(projectId).to.equal(projectName2Id('WebSocketTest_ProjectToBeDeleted'));
                    // assuming the project was successfully created
                    return Q.ninvoke(socket, 'emit', 'deleteProject', {projectId: projectId});
                })
                .then(function () {
                    done();
                })
                .catch(function (err) {
                    done(new Error(err));
                });
        });

        it('should open an existing project and return with auth info for project', function (done) {
            openSocketIo()
                .then(function (socket) {
                    var data = {
                        projectId: projectName2Id(projectName)
                    };

                    return Q.ninvoke(socket, 'emit', 'openProject', data);
                })
                .then(function (callbackArgs) {
                    expect(callbackArgs[0]).to.have.property('master'); // branches
                    expect(callbackArgs[1]).to.include.keys('read', 'write', 'delete'); // access
                    expect(callbackArgs[1].read).to.equal(true);
                    expect(callbackArgs[1].write).to.equal(true);
                    expect(callbackArgs[1].delete).to.equal(true);
                })
                .nodeify(done);
        });

        it('should open and close an existing project', function (done) {
            var socket,
                data = {
                    projectId: projectName2Id(projectName)
                };

            openSocketIo()
                .then(function (socket_) {
                    socket = socket_;
                    return Q.ninvoke(socket, 'emit', 'openProject', data);
                })
                .then(function (callbackArgs) {
                    expect(callbackArgs[0]).to.have.property('master'); // branches
                    expect(callbackArgs[1]).to.include.keys('read', 'write', 'delete'); // access
                    return Q.ninvoke(socket, 'emit', 'closeProject', data);
                })
                .then(function () {
                    done();
                })
                .catch(function (err) {
                    done(new Error(err));
                });
        });

        it('should fail to open a non-existent project', function (done) {
            openSocketIo()
                .then(function (socket) {
                    var data = {
                        projectId: 'project_does_not_exist'
                    };

                    return Q.ninvoke(socket, 'emit', 'openProject', data);
                })
                .then(function () {
                    throw new Error('should have failed to openProject');
                })
                .catch(function (err) {
                    if (typeof err === 'string' && err.indexOf('Project does not exist') > -1) {
                        return;
                    }
                    throw new Error('should have failed to openProject: ' + err);
                })
                .nodeify(done);
        });

        it('should fail to open a project, when there is no read access', function (done) {
            openSocketIo()
                .then(function (socket) {
                    var data = {
                        projectId: projectName2Id(projectNameUnauthorized)
                    };

                    return Q.ninvoke(socket, 'emit', 'openProject', data);
                })
                .then(function () {
                    throw new Error('should have failed to openProject');
                })
                .catch(function (err) {
                    if (typeof err === 'string' && err.indexOf('Not authorized') > -1) {
                        return;
                    }
                    throw new Error('should have failed to openProject: ' + err);
                })
                .nodeify(done);
        });


        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Branch related tests

        it('should open an existing branch', function (done) {
            openSocketIo()
                .then(function (socket) {
                    var data = {
                        projectId: projectName2Id(projectName),
                        branchName: 'master'
                    };

                    return Q.ninvoke(socket, 'emit', 'openBranch', data);
                })
                .then(function (result) {
                    expect(result.branchName).to.equal('master');
                    expect(result.projectId).to.equal(projectName2Id(projectName));
                })
                .nodeify(done);
        });

        it('should fail to open a non-existing branch', function (done) {
            openSocketIo()
                .then(function (socket) {
                    var data = {
                        projectId: projectName2Id(projectName),
                        branchName: 'branch_does_not_exist'
                    };

                    return Q.ninvoke(socket, 'emit', 'openBranch', data);
                })
                .then(function () {
                    throw new Error('should have failed to openBranch');
                })
                .catch(function (err) {
                    if (typeof err === 'string' && err.indexOf('does not exist') > -1) {
                        return;
                    }
                    throw new Error('should have failed to openBranch: ' + err);
                })
                .nodeify(done);
        });

        it('should open and close branch', function (done) {
            var socket,
                data = {
                    projectId: projectName2Id(projectName),
                    branchName: 'master'
                };

            openSocketIo()
                .then(function (socket_) {
                    socket = socket_;
                    return Q.ninvoke(socket, 'emit', 'openBranch', data);
                })
                .then(function (result) {
                    expect(result.branchName).to.equal('master');
                    expect(result.projectId).to.equal(projectName2Id(projectName));
                    return Q.ninvoke(socket, 'emit', 'closeBranch', data);
                })
                .then(function () {
                    done();
                })
                .catch(function (err) {
                    done(new Error(err));
                });
        });

        it('should getBranches', function (done) {
            openSocketIo()
                .then(function (socket) {
                    var data = {
                        projectId: projectName2Id(projectName)
                    };

                    return Q.ninvoke(socket, 'emit', 'getBranches', data);
                })
                .then(function (result) {
                    expect(result).to.have.property('master');
                    done();
                })
                .catch(function (err) {
                    done(new Error(err));
                });
        });

        it('should create and delete branch using setBranchHash', function (done) {
            var socket,
                data = {
                    projectId: projectName2Id(projectName),
                    branchName: 'newBranch'
                };

            openSocketIo()
                .then(function (socket_) {
                    socket = socket_;
                    return Q.ninvoke(socket, 'emit', 'getBranches', data);
                })
                .then(function (result) {
                    expect(result).to.have.property('master');
                    expect(result).to.not.have.property(data.branchName);
                    data.oldHash = '';
                    data.newHash = result.master;
                    return Q.ninvoke(socket, 'emit', 'setBranchHash', data);
                })
                .then(function () {
                    return Q.ninvoke(socket, 'emit', 'getBranches', data);
                })
                .then(function (result) {
                    expect(result).to.have.property('master');
                    expect(result).to.have.property(data.branchName);
                    data.oldHash = data.newHash;
                    data.newHash = '';
                    return Q.ninvoke(socket, 'emit', 'setBranchHash', data);
                })
                .then(function () {
                    return Q.ninvoke(socket, 'emit', 'getBranches', data);
                })
                .then(function (result) {
                    expect(result).to.have.property('master');
                    expect(result).to.not.have.property(data.branchName);
                })
                .nodeify(done);
        });

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Commit related tests

        it('should getCommits', function (done) {
            openSocketIo()
                .then(function (socket) {
                    var data = {
                        projectId: projectName2Id(projectName),
                        before: (new Date()).getTime(), // current time
                        number: 100
                    };

                    return Q.ninvoke(socket, 'emit', 'getCommits', data);
                })
                .then(function (result) {
                    expect(result.length).to.equal(1);
                    expect(result[0]).to.have.property('message');
                    expect(result[0]).to.have.property('parents');
                    expect(result[0]).to.have.property('root');
                    expect(result[0]).to.have.property('time');
                    expect(result[0]).to.have.property('type');
                    expect(result[0]).to.have.property('updater');
                    expect(result[0]).to.have.property('_id');
                })
                .nodeify(done);
        });

        it('should getLatestCommitData', function (done) {
            openSocketIo()
                .then(function (socket) {
                    var data = {
                        projectId: projectName2Id(projectName),
                        branchName: 'master'
                    };

                    return Q.ninvoke(socket, 'emit', 'getLatestCommitData', data);
                })
                .then(function (result) {
                    expect(result.projectId).to.equal(projectName2Id(projectName));
                    expect(result.branchName).to.equal('master');
                    expect(result).to.have.property('commitObject');
                    expect(result).to.have.property('coreObjects');
                })
                .nodeify(done);
        });

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Watcher related tests

        it('should get PROJECT_CREATED event with watchDatabase', function (done) {
            var socket,
                data = {
                    projectName: 'WebSocketTest_PROJECT_CREATED',
                    branchName: 'master',
                    join: true
                },
                deferred = Q.defer(),
                eventHandler = function (resultData) {
                    expect(resultData.projectId).to.equal(projectName2Id(data.projectName));

                    data.join = false;
                    Q.ninvoke(socket, 'emit', 'watchDatabase', data)
                        .then(function () {
                            deferred.resolve(resultData);
                        })
                        .catch(deferred.reject);
                };

            openSocketIo()
                .then(function (socket_) {
                    socket = socket_;
                    socket.on(CONSTANTS.PROJECT_CREATED, eventHandler);
                    return Q.ninvoke(socket, 'emit', 'watchDatabase', data);
                })
                .then(function () {
                    return Q.ninvoke(socket, 'emit', 'createProject', data);
                })
                .then(function () {
                    return deferred.promise;
                })
                .nodeify(done);
        });

        it('should get PROJECT_DELETED event with watchDatabase', function (done) {
            var socket,
                data = {
                    projectId: projectName2Id('WebSocketTest_PROJECT_DELETED'),
                    branchName: 'master',
                    join: true
                },
                deferred = Q.defer(),
                eventHandler = function (resultData) {
                    expect(resultData.projectId).to.equal(data.projectId);

                    data.join = false;
                    Q.ninvoke(socket, 'emit', 'watchDatabase', data)
                        .then(function () {
                            deferred.resolve(resultData);
                        })
                        .catch(deferred.reject);
                };

            openSocketIo()
                .then(function (socket_) {
                    socket = socket_;
                    socket.on(CONSTANTS.PROJECT_DELETED, eventHandler);
                    return Q.ninvoke(socket, 'emit', 'watchDatabase', data);
                })
                .then(function () {
                    return Q.ninvoke(socket, 'emit', 'createProject', {projectName: 'WebSocketTest_PROJECT_DELETED'});
                })
                .then(function () {
                    return Q.ninvoke(socket, 'emit', 'deleteProject', data);
                })
                .then(function () {
                    return deferred.promise;
                })
                .nodeify(done);
        });

        it('should get BRANCH_CREATED event with watchProject', function (done) {
            var socket,
                data = {
                    projectId: projectName2Id('WebSocketTest_BRANCH_CREATED'),
                    branchName: 'new_branch',
                    join: true
                },
                deferred = Q.defer(),
                newBranchHash,
                eventHandler = function (resultData) {
                    expect(resultData.projectId).to.equal(data.projectId);
                    expect(resultData.branchName).to.equal(data.branchName);
                    expect(resultData.newHash).to.equal(newBranchHash);

                    data.join = false;
                    Q.ninvoke(socket, 'emit', 'watchProject', data)
                        .then(function () {
                            deferred.resolve(resultData);
                        })
                        .catch(deferred.reject);
                };

            openSocketIo()
                .then(function (socket_) {
                    socket = socket_;
                    socket.on(CONSTANTS.BRANCH_CREATED, eventHandler);
                    return Q.ninvoke(socket, 'emit', 'watchProject', data);
                })
                .then(function () {
                    return Q.ninvoke(socket, 'emit', 'getBranches', data);
                })
                .then(function (result) {
                    expect(result).to.have.property('master');
                    expect(result).to.not.have.property(data.branchName);
                    data.oldHash = '';
                    data.newHash = result.master;
                    newBranchHash = data.newHash;
                    return Q.ninvoke(socket, 'emit', 'setBranchHash', data);
                })
                .then(function () {
                    return deferred.promise;
                })
                .nodeify(done);
        });

        it('should get BRANCH_DELETED event with watchProject', function (done) {
            var socket,
                data = {
                    projectId: projectName2Id('WebSocketTest_BRANCH_DELETED'),
                    branchName: 'master',
                    join: true
                },
                deferred = Q.defer(),
                newBranchHash,
                eventHandler = function (resultData) {
                    expect(resultData.projectId).to.equal(data.projectId);
                    expect(resultData.branchName).to.equal(data.branchName);
                    expect(resultData.newHash).to.equal(newBranchHash);

                    data.join = false;
                    Q.ninvoke(socket, 'emit', 'watchProject', data)
                        .then(function () {
                            deferred.resolve(resultData);
                        })
                        .catch(deferred.reject);
                };

            openSocketIo()
                .then(function (socket_) {
                    socket = socket_;
                    socket.on(CONSTANTS.BRANCH_DELETED, eventHandler);
                    return Q.ninvoke(socket, 'emit', 'watchProject', data);
                })
                .then(function () {
                    return Q.ninvoke(socket, 'emit', 'getBranches', data);
                })
                .then(function (result) {
                    expect(result).to.have.property('master');
                    data.oldHash = result.master;
                    data.newHash = '';
                    newBranchHash = data.newHash;
                    return Q.ninvoke(socket, 'emit', 'setBranchHash', data);
                })
                .then(function () {
                    return deferred.promise;
                })
                .nodeify(done);
        });

        it('should get BRANCH_HASH_UPDATED event with watchProject', function (done) {
            var socketListen,
                branchName = 'b1',
                data = {
                    projectId: projectName2Id('WebSocketTest_BRANCH_HASH_UPDATED'),
                    branchName: branchName,
                    join: true
                },
                newBranchHash,
                eventHandler = function (resultData) {
                    expect(resultData.projectId).to.equal(data.projectId);
                    expect(resultData.branchName).to.equal(data.branchName);
                    expect(resultData.newHash).to.equal(newBranchHash);
                    data.join = false;
                    Q.ninvoke(socketListen, 'emit', 'watchProject', data)
                        .finally(done);
                };

            ir.project.createBranch(branchName, ir.commitHash)
                .then(function () {
                    return openSocketIo();
                })
                .then(function (socket) {
                    socketListen = socket;
                    socketListen.on(CONSTANTS.BRANCH_HASH_UPDATED, eventHandler);
                    return Q.ninvoke(socketListen, 'emit', 'watchProject', data);
                })
                .then(function () {
                    return Q.ninvoke(socketListen, 'emit', 'getBranches', data);
                })
                .then(function (result) {
                    expect(result).to.have.property(branchName);
                    data.oldHash = result[branchName];
                    data.newHash = ir.commitHash2;
                    newBranchHash = data.newHash;
                    return Q.ninvoke(socketListen, 'emit', 'setBranchHash', data);
                })
                .catch(done);
        });

        it('should get BRANCH_UPDATED event with watchBranch', function (done) {
            var socketListen,
                socketSend,
                branchName = 'b2',
                data = {
                    projectId: projectName2Id('WebSocketTest_BRANCH_HASH_UPDATED'),
                    branchName: branchName,
                    join: true
                },
                newBranchHash,
                eventHandler = function (resultData) {
                    expect(resultData.projectId).to.equal(data.projectId);
                    expect(resultData.branchName).to.equal(data.branchName);
                    expect(resultData.newHash).to.equal(newBranchHash);

                    data.join = false;
                    Q.ninvoke(socketListen, 'emit', 'watchBranch', data)
                        .finally(done);
                };

            ir.project.createBranch(branchName, ir.commitHash)
                .then(function () {
                    return Q.allDone([
                        openSocketIo(),
                        openSocketIo()
                    ]);
                })
                .then(function (sockets) {
                    socketListen = sockets[0];
                    socketSend = sockets[1];
                    socketListen.on(CONSTANTS.BRANCH_HASH_UPDATED, eventHandler);
                    return Q.ninvoke(socketListen, 'emit', 'watchBranch', data);
                })
                .then(function () {
                    return Q.ninvoke(socketListen, 'emit', 'getBranches', data);
                })
                .then(function (result) {
                    expect(result).to.have.property(branchName);
                    data.oldHash = result[branchName];
                    data.newHash = ir.commitHash2;
                    newBranchHash = data.newHash;
                    return Q.ninvoke(socketSend, 'emit', 'setBranchHash', data);
                })
                .nodeify(done);
        });

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // AddOn related tests

        it('should fail to query addOn without proper workerId', function (done) {
            openSocketIo()
                .then(function (socket) {
                    var data = {
                        anything: 'anyValuie'
                    };

                    return Q.ninvoke(socket, 'emit', 'simpleQuery', 'noWorkerId', data);
                })
                .then(function () {
                    done(new Error('missing error handling'));
                })
                .catch(function (err) {
                    expect(err).to.include('wrong request');
                    done();
                })
                .done();
        });
    });

    describe('with invalid token and user', function () {
        var addFailSimpleCallTestCase = function (functionName) {
                it('should fail to execute \'' + functionName + '\' with invalid token', function (done) {
                    openSocketIo()
                        .then(function (socket) {

                            return Q.ninvoke(socket, 'emit', functionName, {webgmeToken: 'invalid_token'});
                        })
                        .then(function () {
                            done(new Error('missing error handling'));
                        })
                        .catch(function (err) {
                            expect(err).to.include('jwt malformed');
                            done();
                        })
                        .done();
                });
            },
            simpleFunctions = [
                'watchProject',
                'watchBranch',
                'makeCommit',
                'setBranchHash',
                'getBranchHash',
                'getProjects',
                'deleteProject',
                'getBranches',
                'getCommits',
                'getLatestCommitData',
                'getCommonAncestorCommit',
                'simpleRequest',
                //'simpleResult',

            ],
            i;

        before(function (done) {
            var gmeConfigWithAuth = testFixture.getGmeConfig();
            gmeConfigWithAuth.authentication.enable = true;
            gmeConfigWithAuth.authentication.allowGuests = true;
            server = WebGME.standaloneServer(gmeConfigWithAuth);
            serverBaseUrl = server.getUrl();
            Q.ninvoke(server, 'start')
                .then(function () {
                    return testFixture.clearDBAndGetGMEAuth(gmeConfigWithAuth, projectName);

                })
                .then(function (gmeAuth_) {
                    gmeAuth = gmeAuth_;
                    done();
                })
                .catch(function (err) {
                    done(err);
                })
                .done();
        });

        beforeEach(function () {
            agent = superagent.agent();
        });

        after(function (done) {
            Q.allDone([
                Q.ninvoke(server, 'stop'),
                gmeAuth.unload()
            ])
                .nodeify(done);
        });

        for (i = 0; i < simpleFunctions.length; i++) {
            addFailSimpleCallTestCase(simpleFunctions[i]);
        }

        it('should fail to call simpleQuery', function (done) {
            openSocketIo()
                .then(function (socket) {

                    return Q.ninvoke(socket, 'emit', 'simpleQuery', 'someWorkerId', {webgmeToken: 'invalid_token'});
                })
                .then(function () {
                    done(new Error('missing error handling'));
                })
                .catch(function (err) {
                    expect(err).to.include('jwt malformed');
                    done();
                })
                .done();
        });
    });

    describe('makeCommit and auto-merge', function () {
        var ir,
            user;

        before(function (done) {
            var gmeConfigWithAutoMerge = JSON.parse(JSON.stringify(gmeConfig));
            gmeConfigWithAutoMerge.storage.autoMerge.enable = true;
            user = gmeConfigWithAutoMerge.authentication.guestAccount;
            server = WebGME.standaloneServer(gmeConfigWithAutoMerge);
            serverBaseUrl = server.getUrl();
            server.start(function (err) {
                if (err) {
                    done(new Error(err));
                    return;
                }

                testFixture.clearDBAndGetGMEAuth(gmeConfigWithAutoMerge, projects)
                    .then(function (gmeAuth_) {
                        gmeAuth = gmeAuth_;
                        safeStorage = testFixture.getMongoStorage(logger, gmeConfigWithAutoMerge, gmeAuth);

                        return safeStorage.openDatabase();
                    })
                    .then(function () {
                        return Q.allDone([
                            testFixture.importProject(safeStorage, {
                                projectSeed: 'seeds/EmptyProject.webgmex',
                                projectName: projectName,
                                gmeConfig: gmeConfigWithAutoMerge,
                                logger: logger
                            })
                        ]);
                    })
                    .then(function (result) {
                        ir = result[0];
                        return Q.allDone([
                            ir.project.makeCommit(null, [ir.commitHash], ir.rootHash, {}, 'empty commit')
                        ]);
                    })
                    .then(function (result) {
                        ir.commitHash2 = result[0].hash;

                        return ir.core.loadRoot(ir.rootHash);
                    })
                    .then(function (rootNode) {
                        var persisted;

                        ir.core.setAttribute(rootNode, 'name', 'newName');
                        persisted = ir.core.persist(rootNode);
                        return ir.project.makeCommit(null, [ir.commitHash], persisted.rootHash, persisted.objects,
                            'root change');
                    })
                    .then(function (result) {
                        ir.commitHash3 = result.hash;
                    })
                    .nodeify(done);
            });
        });

        after(function (done) {
            server.stop(function (err) {
                if (err) {
                    done(new Error(err));
                    return;
                }

                Q.allDone([
                    gmeAuth.unload(),
                    safeStorage.closeDatabase()
                ])
                    .nodeify(done);
            });
        });

        beforeEach(function () {
            agent = superagent.agent();
        });

        it('should return MERGED when makeCommit with old commitHash of branch and can merge', function (done) {
            var socketSend,
                branchName = 'b1',
                data = {
                    projectId: projectName2Id(projectName),
                    branchName: branchName,
                    rootHash: null,
                    commitObject: null,
                    coreObjects: {}
                };

            // The branch we're committing to is pointing to changed one.
            ir.project.createBranch(branchName, ir.commitHash3)
                .then(function () {
                    return ir.core.loadRoot(ir.rootHash);
                })
                .then(function (rootNode) {
                    var persisted,
                        commitObj;

                    ir.core.setAttribute(rootNode, 'dummy', 'DummyVal');
                    persisted = ir.core.persist(rootNode);
                    commitObj = ir.project.createCommitObject([ir.commitHash], persisted.rootHash, user, 'rootChange');
                    data.rootHash = persisted.rootHash;
                    data.commitObject = commitObj;
                    data.coreObjects[data.rootHash] = persisted.objects[data.rootHash].newData;

                    return Q.allDone([
                        openSocketIo()
                    ]);
                })
                .then(function (sockets) {
                    socketSend = sockets[0];
                    return Q.ninvoke(socketSend, 'emit', 'makeCommit', data);
                })
                .then(function (commitResult) {
                    expect(commitResult.status).to.equal(CONSTANTS.MERGED);
                    expect(commitResult.hash).to.equal(data.commitObject._id);
                    expect(commitResult.theirHash).to.equal(ir.commitHash3);
                })
                .nodeify(done);
        });

        it('should return FORKED when makeCommit with old commitHash of branch when cannot merge', function (done) {
            var socketSend,
                branchName = 'b2',
                data = {
                    projectId: projectName2Id(projectName),
                    branchName: branchName,
                    rootHash: null,
                    commitObject: null,
                    coreObjects: {}
                };

            ir.project.createBranch(branchName, ir.commitHash3)
                .then(function () {
                    return ir.core.loadRoot(ir.rootHash);
                })
                .then(function (rootNode) {
                    var persisted,
                        commitObj;

                    ir.core.setAttribute(rootNode, 'name', 'conflictName');
                    persisted = ir.core.persist(rootNode);
                    commitObj = ir.project.createCommitObject([ir.commitHash], persisted.rootHash, user, 'rootChange');
                    data.rootHash = persisted.rootHash;
                    data.commitObject = commitObj;
                    data.coreObjects[data.rootHash] = persisted.objects[data.rootHash].newData;

                    return Q.allDone([
                        openSocketIo()
                    ]);
                })
                .then(function (sockets) {
                    socketSend = sockets[0];
                    return Q.ninvoke(socketSend, 'emit', 'makeCommit', data);
                })
                .then(function (commitResult) {
                    expect(commitResult.status).to.equal(CONSTANTS.FORKED);
                    expect(commitResult.hash).to.equal(data.commitObject._id);
                })
                .nodeify(done);
        });
    });
});