/*jshint node:true*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

'use strict';

var Q = require('q'),
    BlobFSBackend = require('./BlobFSBackend'),
    BlobRunPluginClient = require('./BlobRunPluginClient');

function BlobClientWithFSBackend(gmeConfig, logger, opts) {
    var blobBackend = new BlobFSBackend(gmeConfig, logger),
        blobClient = new BlobRunPluginClient(blobBackend, logger, opts);

    // Forward the buckets for users.
    blobClient.contentBucket = blobBackend.contentBucket;
    blobClient.metadataBucket = blobBackend.metadataBucket;
    blobClient.tempBucket = blobBackend.tempBucket;

    blobClient.listObjects = function (bucket, callback) {
        var deferred = Q.defer();

        blobBackend.listObjects(bucket, function (err, hashes) {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve(hashes);
            }
        });

        return deferred.promise.nodeify(callback);
    };

    blobClient.deleteObject = function (bucket, hash, callback) {
        var deferred = Q.defer();

        blobBackend.__deleteObject(bucket, hash, function (err) {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve();
            }
        });

        return deferred.promise.nodeify(callback);
    };

    return blobClient;
}

module.exports = BlobClientWithFSBackend;