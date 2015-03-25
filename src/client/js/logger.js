/*globals define*/
/*jshint node:true*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

define(['lib/debug/debug'], function () {
    'use strict';
    //var debug = require('debug');
    function createLogger(name, options) {
        var log = debug(name),
            level,
            levels = {
                silly: 0,
                input: 1,
                verbose: 2,
                prompt: 3,
                debug: 4,
                info: 5,
                data: 6,
                help: 7,
                warn: 8,
                error: 9
            };
        options = options || {};
        level = levels[options.level];
        if (typeof level === 'undefined') {
            level = levels.info;
        }

        log.debug = function () {
            if (log.enabled && level <= levels.debug) {
                if (console.debug) {
                    log.log = console.debug.bind(console);
                } else {
                    log.log = console.log.bind(console);
                }
                log.apply(this, arguments);
            }
        };
        log.info = function () {
            if (log.enabled && level <= levels.info) {
                log.log = console.info.bind(console);
                log.apply(this, arguments);
            }
        };
        log.warn = function () {
            if (log.enabled && level <= levels.warn) {
                log.log = console.warn.bind(console);
                log.apply(this, arguments);
            }
        };
        log.error = function () {
            if (log.enabled && level <= levels.error) {
                log.log = console.error.bind(console);
                log.apply(this, arguments);
            } else {
                console.error.apply(console, arguments);
            }
        };

        return log;
    }

    return {
        create: createLogger
    };
});