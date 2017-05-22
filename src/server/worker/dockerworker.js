/*jshint node:true*/

/**
 * @module Server.SimpleWorker
 * @author kecso / https://github.com/kecso
 * @author pmeijer / https://github.com/pmeijer
 */

'use strict';

var WEBGME = require(__dirname + '/../../../webgme'),

    CONSTANTS = require('./constants'),
    Logger = require('../logger'),
    WorkerRequests = require('./workerrequests'),
    gmeConfig = WEBGME.getGmeConfig(),
    logger = Logger.create('gme:server:worker:simpleworker:pid_' + process.pid, gmeConfig.server.log, true);

function safeSend(data) {
    if (data.error) {
        console.error(JSON.stringify(data));
    } else {
        console.log(JSON.stringify(data));
    }
}

function runCommand(parameters) {
    var wr = new WorkerRequests(logger, gmeConfig, parameters.webgmeUrl);
    parameters = parameters || {};
    parameters.command = parameters.command;

    logger.debug('Incoming message:', {metadata: parameters});

    if (parameters.command === CONSTANTS.workerCommands.executePlugin) {
        wr.executePlugin(parameters.webgmeToken, parameters.socketId, parameters.name, parameters.context,
            function (err, result) {
                safeSend({
                    pid: process.pid,
                    type: CONSTANTS.msgTypes.result,
                    error: err ? err.message : null,
                    result: result
                });
            }
        );
    } else {
        safeSend({
            pid: process.pid,
            type: CONSTANTS.msgTypes.result,
            error: 'unknown command',
            resid: null
        });
    }
}

runCommand(JSON.parse(process.argv[2]));