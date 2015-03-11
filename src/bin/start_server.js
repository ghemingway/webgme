/*jshint node: true*/
/**
 * @author kecso / https://github.com/kecso
 */

var path = require('path'),
    gmeConfig = require('../../config'),
    webgme = require('../../webgme'),
    myServer;

webgme.addToRequireJsPaths(gmeConfig);

myServer = new webgme.standaloneServer(gmeConfig);
myServer.start();
//console.log(gmeConfig);