/*jshint node:true, mocha:true*/
/**
 * @author lattmann / https://github.com/lattmann
 */


var testFixture = require('../../../_globals.js');

describe('storage storageclasses simpleapi', function () {
    'use strict';
    var NodeStorage = testFixture.requirejs('common/storage/nodestorage'),
        STORAGE_CONSTANTS = testFixture.requirejs('common/storage/constants'),
        gmeConfig = testFixture.getGmeConfig(),
        WebGME = testFixture.WebGME,
        openSocketIo = testFixture.openSocketIo,
        superagent = testFixture.superagent,
        Q = testFixture.Q,
        projectName2Id = testFixture.projectName2Id,

        expect = testFixture.expect,

        agent,
        socket,
        logger = testFixture.logger.fork('simpleapi.spec'),

        guestAccount = gmeConfig.authentication.guestAccount,
        server,
        gmeAuth,
        safeStorage,
        storage,
        webgmeToken,

        projectName = 'SimpleAPIProject',
        shardedProjectName = 'ShardedSimpleAPIProject',
        projectNameCreate = 'SimpleAPICreateProject',
        projectNameCreate2 = 'SimpleAPICreateProject2',
        projectNameDelete = 'SimpleAPIDeleteProject',
        projectNameTransfer = 'SimpleAPIProjectNameTransfer',
        importResult,
        originalHash,
        commitHash1,
        commitHash2;

    before(function (done) {
        var commitObject,
            commitData;

        server = WebGME.standaloneServer(gmeConfig);
        server.start(function (err) {
            if (err) {
                done(new Error(err));
                return;
            }

            testFixture.clearDBAndGetGMEAuth(gmeConfig,
                [projectName, shardedProjectName, projectNameCreate, projectNameCreate2, projectNameDelete])
                .then(function (gmeAuth_) {
                    gmeAuth = gmeAuth_;
                    return gmeAuth.addOrganization('orgId');
                })
                .then(function () {
                    return gmeAuth.addUserToOrganization(gmeConfig.authentication.guestAccount, 'orgId');
                })
                .then(function () {
                    return gmeAuth.setAdminForUserInOrganization(gmeConfig.authentication.guestAccount, 'orgId', true);
                })
                .then(function () {
                    safeStorage = testFixture.getMongoStorage(logger, gmeConfig, gmeAuth);
                    return safeStorage.openDatabase();
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
                            projectSeed: 'test/bin/export/minimalShard.webgmex',
                            projectName: shardedProjectName,
                            gmeConfig: gmeConfig,
                            logger: logger
                        })
                    ]);
                })
                .then(function (results) {
                    importResult = results[0]; // projectName
                    originalHash = importResult.commitHash;

                    commitObject = importResult.project.createCommitObject([originalHash],
                        importResult.rootHash,
                        'tester1',
                        'commit msg 1');
                    commitData = {
                        projectId: projectName2Id(projectName),
                        commitObject: commitObject,
                        coreObjects: []
                    };

                    return safeStorage.makeCommit(commitData);
                })
                .then(function (result) {
                    commitHash1 = result.hash;

                    commitObject = importResult.project.createCommitObject([originalHash],
                        importResult.rootHash,
                        'tester2',
                        'commit msg 2');
                    commitData = {
                        projectId: projectName2Id(projectName),
                        commitObject: commitObject,
                        coreObjects: []
                    };

                    return safeStorage.makeCommit(commitData);
                })
                .then(function (result) {
                    commitHash2 = result.hash;
                    return importResult.project.createTag('tag', originalHash);
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

    beforeEach(function (done) {
        agent = superagent.agent();
        openSocketIo(server, agent, guestAccount, guestAccount)
            .then(function (result) {
                socket = result.socket;
                webgmeToken = result.webgmeToken;
                storage = NodeStorage.createStorage(null,
                    result.webgmeToken,
                    logger,
                    gmeConfig);
                storage.open(function (networkState) {
                    if (networkState === STORAGE_CONSTANTS.CONNECTED) {
                        done();
                    } else {
                        throw new Error('Unexpected network state: ' + networkState);
                    }
                });
            })
            .catch(done);
    });

    afterEach(function (done) {
        storage.close(function (err) {
            socket.disconnect();
            done(err);
        });
    });

    it('should getProjects', function (done) {
        Q.ninvoke(storage, 'getProjects', {})
            .then(function (projects) {
                var ids = [];

                expect(projects.length).to.equal(2);

                ids.push(projects[0]._id);
                ids.push(projects[1]._id);
                expect(ids).to.have.members([projectName2Id(projectName), projectName2Id(shardedProjectName)]);
            })
            .nodeify(done);
    });

    it('should getProjectInfo', function (done) {
        Q.ninvoke(storage, 'getProjectInfo', projectName2Id(projectName))
            .then(function (projectInfo) {
                expect(Object.keys(projectInfo)).to.have.members([
                    '_id', 'branches', 'hooks', 'info', 'name', 'owner', 'rights'
                ]);
            })
            .nodeify(done);
    });

    it('should fail to getProjectInfo if it not exist', function (done) {
        Q.ninvoke(storage, 'getProjectInfo', projectName2Id('DoesNotExist'))
            .then(function () {
                throw new Error('Should have failed!');
            })
            .catch(function (err) {
                expect(err.message).to.contain('no such project');
            })
            .nodeify(done);
    });

    it('getProjects with projectId should return one entry with same data as getProjectInfo', function (done) {
        Q.all([
            Q.ninvoke(storage, 'getProjects', {
                projectId: projectName2Id(projectName),
                branches: true,
                hooks: true,
                rights: true,
                info: true
            }),
            Q.ninvoke(storage, 'getProjectInfo', projectName2Id(projectName))
        ])
            .then(function (res) {
                expect(res[0].length).to.equal(1);
                expect(res[0][0]).to.deep.equal(res[1]);
            })
            .nodeify(done);
    });

    it('should fail to getProjects if projectId given and does not exist', function (done) {
        Q.ninvoke(storage, 'getProjects', {projectId: projectName2Id('DoesNotExist')})
            .then(function () {
                throw new Error('Should have failed!');
            })
            .catch(function (err) {
                expect(err.message).to.contain('no such project');
            })
            .nodeify(done);
    });

    it('should getBranches', function (done) {
        Q.ninvoke(storage, 'getBranches', projectName2Id(projectName))
            .then(function (branches) {
                expect(Object.keys(branches).length).to.equal(1);
                expect(branches.master).to.equal(importResult.commitHash);

            })
            .nodeify(done);
    });

    it('should getCommits', function (done) {
        Q.ninvoke(storage, 'getCommits', projectName2Id(projectName), (new Date()).getTime(), 100)
            .then(function (commits) {
                expect(commits.length).to.equal(3);
            })
            .nodeify(done);
    });

    it('should getTags', function (done) {
        Q.ninvoke(storage, 'getTags', projectName2Id(projectName))
            .then(function (tags) {
                expect(tags).to.deep.equal({tag: originalHash});
            })
            .nodeify(done);
    });

    it('should getBranchHash', function (done) {
        Q.ninvoke(storage, 'getBranchHash', projectName2Id(projectName), 'master')
            .then(function (hash) {
                expect(hash).to.equal(importResult.commitHash);
            })
            .nodeify(done);
    });

    it('should getHistory from master', function (done) {
        Q.ninvoke(storage, 'getHistory', projectName2Id(projectName), 'master', 10)
            .then(function (commits) {
                expect(commits.length).to.deep.equal(1);
                expect(commits[0]._id).to.deep.equal(importResult.commitHash);
            })
            .nodeify(done);
    });

    it('should getLatestCommitData', function (done) {
        Q.ninvoke(storage, 'getLatestCommitData', projectName2Id(projectName), 'master')
            .then(function (commitData) {
                expect(commitData.branchName).to.equal('master');
                expect(commitData.commitObject._id).to.equal(importResult.commitHash);
            })
            .nodeify(done);
    });

    it('should getLatestCommitData from project with overlay shards', function (done) {
        Q.ninvoke(storage, 'getLatestCommitData', projectName2Id(shardedProjectName), 'master')
            .then(function (commitData) {
                expect(commitData.branchName).to.equal('master');
                expect(commitData.coreObjects).to.have.length(3);
                expect(commitData.coreObjects[0]._id).to.eql('#c1ea6c321019b2d4642f0c8a3dc1d3708b1f72c9');
                expect(commitData.coreObjects[0].ovr.sharded).to.eql(true);
                expect(commitData.coreObjects[1].type).to.eql('shard');
                expect(commitData.coreObjects[2].type).to.eql('shard');
            })
            .nodeify(done);
    });

    it('should getCommonAncestorCommit', function (done) {
        Q.ninvoke(storage, 'getCommonAncestorCommit', projectName2Id(projectName), commitHash1, commitHash2)
            .then(function (commitHash) {
                expect(commitHash).to.equal(importResult.commitHash);
            })
            .nodeify(done);
    });

    it('should createProject', function (done) {
        Q.ninvoke(storage, 'createProject', projectNameCreate)
            .then(function (projectId) {
                expect(projectId).to.equal(projectName2Id(projectNameCreate));
            })
            .nodeify(done);
    });

    it('should createProject with owner', function (done) {
        Q.ninvoke(storage, 'createProject', 'aNewProject', 'guest')
            .then(function (projectId) {
                expect(projectId).to.equal(projectName2Id('aNewProject'));
            })
            .nodeify(done);
    });

    it('should createProject with owner and kind', function (done) {
        var projectId;
        Q.ninvoke(storage, 'createProject', 'aNewProjectWithKind', 'guest', 'kindest')
            .then(function (projectId_) {
                projectId = projectId_;
                expect(projectId).to.equal(projectName2Id('aNewProjectWithKind'));
                return Q.ninvoke(storage, 'getProjects', {info: true});
            })
            .then(function (projects) {
                var found = false;
                projects.forEach(function (project) {
                    if (project._id === projectId) {
                        expect(project.info.kind).to.equal('kindest');
                        found = true;
                    }
                });

                expect(found).to.equal(true);
            })
            .nodeify(done);
    });

    it('should fail to call createProject if project already exists', function (done) {
        Q.ninvoke(storage, 'createProject', projectNameCreate2)
            .then(function (projectId) {
                expect(projectId).to.equal(projectName2Id(projectNameCreate2));
                return Q.ninvoke(storage, 'createProject', projectNameCreate2);
            })
            .then(function () {
                done(new Error('should have failed to create the project twice.'));
            })
            .catch(function (err) {
                expect(err).to.match(/Project already exists/);
            })
            .nodeify(done);
    });

    it('should createProject and deleteProject', function (done) {
        Q.ninvoke(storage, 'createProject', projectNameDelete)
            .then(function (projectId) {
                return Q.ninvoke(storage, 'deleteProject', projectId);
            })
            .then(function (existed) {
                expect(existed).to.equal(true);
            })
            .nodeify(done);
    });

    it('should createProject and transferProject', function (done) {
        var newOwner = 'orgId';
        Q.ninvoke(storage, 'createProject', projectNameTransfer)
            .then(function (projectId) {
                return Q.ninvoke(storage, 'transferProject', projectId, newOwner);
            })
            .then(function (newProjectId) {
                expect(newProjectId).to.equal(testFixture.storageUtil.getProjectIdFromOwnerIdAndProjectName(newOwner,
                    projectNameTransfer));
            })
            .nodeify(done);
    });

    it('should fail to transferProject when it does not exist', function (done) {
        Q.ninvoke(storage, 'transferProject', 'doesNotExist', 'someOwnerId')
            .then(function () {
                throw new Error('Should have failed!');
            })
            .catch(function (err) {
                expect(err.message).to.contain('Not authorized to delete project');
            })
            .nodeify(done);
    });

    it('should setBranchHash', function (done) {
        Q.ninvoke(storage, 'setBranchHash', projectName2Id(projectName), 'newBranch', importResult.commitHash, '')
            .then(function (result) {
                expect(result.status).to.equal('SYNCED');
            })
            .nodeify(done);
    });

    it('should setBranchHash and deleteBranch', function (done) {
        Q.ninvoke(storage, 'setBranchHash', projectName2Id(projectName), 'newBranchToDelete', importResult.commitHash, '')
            .then(function (result) {
                expect(result.status).to.equal('SYNCED');
                return Q.ninvoke(storage, 'deleteBranch', projectName2Id(projectName), 'newBranchToDelete', importResult.commitHash);
            })
            .then(function (result) {
                expect(result.status).to.equal('SYNCED');
            })
            .nodeify(done);
    });

    it('should createBranch', function (done) {
        Q.ninvoke(storage, 'createBranch', projectName2Id(projectName), 'createdBranch', importResult.commitHash)
            .then(function (result) {
                expect(result.status).to.equal('SYNCED');
            })
            .nodeify(done);
    });

    it('should create and delete tag', function (done) {
        Q.ninvoke(storage, 'createTag', projectName2Id(projectName), 'newTag', originalHash)
            .then(function () {
                return Q.ninvoke(storage, 'getTags', projectName2Id(projectName));
            })
            .then(function (tags) {
                expect(tags).to.deep.equal({tag: originalHash, newTag: originalHash});
                return Q.ninvoke(storage, 'deleteTag', projectName2Id(projectName), 'newTag');
            })
            .then(function () {
                return Q.ninvoke(storage, 'getTags', projectName2Id(projectName));
            })
            .then(function (tags) {
                expect(tags).to.deep.equal({tag: originalHash});
            })
            .nodeify(done);
    });

    it('should fail to execute simpleQuery without addOn configured', function (done) {
        Q.ninvoke(storage, 'simpleQuery', 'someWorkerId', {})
            .then(function () {
                done(new Error('missing error handling'));
            })
            .catch(function (err) {
                expect(err.message).to.include('wrong request');
                done();
            })
            .done();
    });
});