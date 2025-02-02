/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author kecso / https://github.com/kecso
 */

define(['common/util/canon',
    'common/core/tasync',
    'common/core/CoreAssert',
    'common/regexp',
    'common/util/random',
    'common/core/constants',
    'common/util/diff'
], function (CANON, TASYNC, ASSERT, REGEXP, RANDOM, CONSTANTS, DIFF) {
    'use strict';

    function DiffCore(innerCore, options) {
        ASSERT(typeof options === 'object');
        ASSERT(typeof options.globConf === 'object');
        ASSERT(typeof options.logger !== 'undefined');

        var logger = options.logger,
            self = this,
            key,
            _conflictItems = [],
            _conflictMine,
            _conflictTheirs,
            _concatBase,
            _concatExtension,
            _concatBaseRemovals,
            _concatMoves;

        for (key in innerCore) {
            this[key] = innerCore[key];
        }

        logger.debug('initialized DiffCore');

        //<editor-fold=Helper Functions>
        function compareRelids(a, b) {
            var aRel = self.getRelid(a),
                bRel = self.getRelid(b);

            if (aRel < bRel) {
                return -1;
            } else if (aRel > bRel) {
                return 1;
            } else {
                return 0;
            }
        }

        function normalize(obj) {
            // TODO: Does this really need to be called as many times as it is?
            if (!obj) {
                return obj;
            }
            var keys = Object.keys(obj),
                i;

            if (JSON.stringify(obj.set) === JSON.stringify({})) {
                delete obj.set;
            }

            for (i = 0; i < keys.length; i++) {
                /*if (Array.isArray(obj[keys[i]])) {
                 if (obj[keys[i]].length === 0) {
                 delete obj[keys[i]];
                 }*/
                if (Array.isArray(obj[keys[i]])) {
                    //do nothing, leave the array as is
                } else if (obj[keys[i]] === undefined) {
                    delete obj[keys[i]]; //there cannot be undefined in the object
                } else if (keys[i] === 'set') {
                    //do nothing with set as it can include empty set's as well
                } else if (typeof obj[keys[i]] === 'object') {
                    normalize(obj[keys[i]]);
                    if (obj[keys[i]] && Object.keys(obj[keys[i]]).length === 0) {
                        delete obj[keys[i]];
                    }
                }
            }
            keys = JSON.parse(JSON.stringify(obj));
            delete keys.guid;
            delete keys.oGuids;
            delete keys.ooGuids;
            delete keys.oBaseGuids;
            delete keys.ooBaseGuids;
            if (Object.keys(keys).length === 0) {
                // it did not have additional information
                delete obj.guid;
                delete obj.oGuids;
                delete obj.ooGuids;
                delete obj.oBaseGuids;
                delete obj.ooBaseGuids;
            }
        }

        function attrDiff(source, target) {
            var sNames = self.getOwnAttributeNames(source),
                tNames = self.getOwnAttributeNames(target),
                diff = {},
                sAttr,
                tAttr,
                i;

            for (i = 0; i < sNames.length; i++) {
                if (tNames.indexOf(sNames[i]) === -1) {
                    diff[sNames[i]] = CONSTANTS.TO_DELETE_STRING;
                }
            }

            for (i = 0; i < tNames.length; i++) {
                sAttr = self.getOwnAttribute(source, tNames[i]);
                tAttr = self.getOwnAttribute(target, tNames[i]);

                if (CANON.stringify(sAttr) !== CANON.stringify(tAttr)) {
                    diff[tNames[i]] = tAttr;
                }
            }

            return diff;
        }

        function regDiff(source, target) {
            var sNames = self.getOwnRegistryNames(source),
                tNames = self.getOwnRegistryNames(target),
                diff = {},
                sReg,
                tReg,
                i;

            for (i = 0; i < sNames.length; i++) {
                if (tNames.indexOf(sNames[i]) === -1) {
                    diff[sNames[i]] = CONSTANTS.TO_DELETE_STRING;
                }
            }

            for (i = 0; i < tNames.length; i++) {
                sReg = self.getOwnRegistry(source, tNames[i]);
                tReg = self.getOwnRegistry(target, tNames[i]);
                if (CANON.stringify(sReg) !== CANON.stringify(tReg)) {
                    diff[tNames[i]] = tReg;
                }
            }

            return diff;
        }

        function childrenDiff(source, target) {
            var sRelids = self.getChildrenRelids(source, true),
                tRelids = self.getChildrenRelids(target, true),
                tHashes = self.getChildrenHashes(target),
                sHashes = self.getChildrenHashes(source),
                relid,
                diff = {added: [], removed: []};

            for (relid in sRelids) {
                if (tRelids.hasOwnProperty(relid) === false) {
                    diff.removed.push({relid: relid, hash: sHashes[relid]});
                }
            }

            for (relid in tRelids) {
                if (sRelids.hasOwnProperty(relid) === false) {
                    diff.added.push({relid: relid, hash: tHashes[relid]});
                }
            }

            return diff;
        }

        function pointerDiff(source, target) {
            // FIXME: Shouldn't these be ownPointerNames?
            var getPointerData = function (node) {
                    var data = {},
                        names = self.getPointerNames(node),
                        i;
                    for (i = 0; i < names.length; i++) {
                        data[names[i]] = self.getPointerPath(node, names[i]);
                    }
                    return data;
                },
                sPointer = getPointerData(source),
                tPointer = getPointerData(target);

            if (CANON.stringify(sPointer) !== CANON.stringify(tPointer)) {
                return {source: sPointer, target: tPointer};
            }
            return {};
        }

        function setDiff(source, target) {
            var getSetData = function (node) {
                    var data = {},
                        names, targets, keys, i, j, k;

                    names = self.getSetNames(node);
                    for (i = 0; i < names.length; i++) {
                        data[names[i]] = {attr: {}, reg: {}};
                        keys = self.getOwnSetAttributeNames(node, names[i]);
                        for (j = 0; j < keys.length; j += 1) {
                            data[names[i]].attr[keys[j]] = self.getOwnSetAttribute(node, names[i], keys[j]);
                        }
                        keys = self.getOwnSetRegistryNames(node, names[i]);
                        for (j = 0; j < keys.length; j += 1) {
                            data[names[i]].reg[keys[j]] = self.getOwnSetRegistry(node, names[i], keys[j]);
                        }

                        targets = self.getMemberPaths(node, names[i]);
                        for (j = 0; j < targets.length; j++) {
                            data[names[i]][targets[j]] = {attr: {}, reg: {}};
                            keys = self.getMemberOwnAttributeNames(node, names[i], targets[j]);
                            for (k = 0; k < keys.length; k++) {
                                data[names[i]][targets[j]].attr[keys[k]] = self.getMemberAttribute(node,
                                    names[i], targets[j], keys[k]);
                            }
                            keys = self.getMemberRegistryNames(node, names[i], targets[j]);
                            for (k = 0; k < keys.length; k++) {
                                data[names[i]][targets[j]].reg[keys[k]] = self.getMemberRegistry(node,
                                    names[i], targets[j], keys[k]);
                            }
                        }
                    }

                    return data;

                },
                sSet = getSetData(source),
                tSet = getSetData(target);

            if (CANON.stringify(sSet) !== CANON.stringify(tSet)) {
                return {source: sSet, target: tSet};
            }
            return {};
        }

        function ovrDiff(source, target) {
            var sOvr = self.getRawOverlayInformation(source),
                tOvr = self.getRawOverlayInformation(target);

            if (CANON.stringify(sOvr) !== CANON.stringify(tOvr)) {
                return {source: sOvr, target: tOvr};
            }
            return {};
        }

        function metaDiff(source, target) {
            var convertJsonMeta = function (jsonMeta) {
                    var i, j, names, itemsObject;
                    //children
                    if (jsonMeta.children) {
                        itemsObject = jsonMeta.children;
                        for (i = 0; i < itemsObject.items.length; i += 1) {
                            itemsObject[itemsObject.items[i]] = {
                                min: itemsObject.minItems[i],
                                max: itemsObject.maxItems[i]
                            };
                        }
                        delete itemsObject.items;
                        delete itemsObject.minItems;
                        delete itemsObject.maxItems;
                    }
                    //ptr
                    if (jsonMeta.pointers) {
                        names = Object.keys(jsonMeta.pointers);

                        for (j = 0; j < names.length; j += 1) {
                            itemsObject = jsonMeta.pointers[names[j]];
                            for (i = 0; i < itemsObject.items.length; i += 1) {
                                itemsObject[itemsObject.items[i]] = {
                                    min: itemsObject.minItems[i],
                                    max: itemsObject.maxItems[i]
                                };
                            }
                            delete itemsObject.items;
                            delete itemsObject.minItems;
                            delete itemsObject.maxItems;
                        }
                    }
                    return jsonMeta;
                },
                sMeta = convertJsonMeta(self.getOwnJsonMeta(source)),
                tMeta = convertJsonMeta(self.getOwnJsonMeta(target));
            if (CANON.stringify(sMeta) !== CANON.stringify(tMeta)) {
                return {source: sMeta, target: tMeta};
            }
            return {};
        }

        function combineMoveIntoMetaDiff(diff, diffMoves) {
            var keys = Object.keys(diff),
                i;
            for (i = 0; i < keys.length; i++) {
                if (diffMoves[keys[i]]) {
                    diff[diffMoves[keys[i]]] = diff[keys[i]];
                    delete diff[keys[i]];
                } else if (typeof diff[keys[i]] === 'object') {
                    combineMoveIntoMetaDiff(diff[keys[i]], diffMoves);
                }
            }
        }

        function combineMoveIntoPointerDiff(diff, diffMoves) {
            var keys = Object.keys(diff),
                i;
            for (i = 0; i < keys.length; i++) {
                if (diffMoves[diff[keys[i]]]) {
                    diff[keys[i]] = diffMoves[diff[keys[i]]];
                }
            }
        }

        function getDiffChildrenRelids(diff) {
            var keys = Object.keys(diff || {}),
                i,
                filteredKeys = [];

            for (i = 0; i < keys.length; i++) {
                if (DIFF.FORBIDDEN_WORDS[keys[i]] !== true) {
                    filteredKeys.push(keys[i]);
                }
            }
            return filteredKeys;
        }

        function arrayDiff(source, target) {
            var i,
                diff = {};
            for (i = 0; i < source.length; i += 1) {
                if (target.indexOf(source[i]) === -1) {
                    diff[source[i]] = CONSTANTS.TO_DELETE_STRING;
                }
            }

            for (i = 0; i < target.length; i += 1) {
                if (source.indexOf(target[i])) {
                    diff[target[i]] = true;
                }
            }
            return diff;
        }

        function diffObjects(source, target) {
            var diff = {},
                sKeys = Object.keys(source),
                tKeys = Object.keys(target),
                tDiff, i;
            for (i = 0; i < sKeys.length; i++) {
                if (tKeys.indexOf(sKeys[i]) === -1) {
                    diff[sKeys[i]] = CONSTANTS.TO_DELETE_STRING;
                }
            }
            for (i = 0; i < tKeys.length; i++) {
                if (sKeys.indexOf(tKeys[i]) === -1) {
                    diff[tKeys[i]] = target[tKeys[i]];
                } else {
                    if (typeof target[tKeys[i]] === typeof source[tKeys[i]]) {
                        tDiff = {};
                        if (source[tKeys[i]] instanceof Array && target[tKeys[i]] instanceof Array) {
                            tDiff = arrayDiff(source[tKeys[i]], target[tKeys[i]]);
                        } else if (typeof target[tKeys[i]] === 'object' &&
                            target[tKeys[i]] !== null && source[tKeys[i]] !== null) {
                            tDiff = diffObjects(source[tKeys[i]], target[tKeys[i]]);
                        } else if (source[tKeys[i]] !== target[tKeys[i]]) {
                            diff[tKeys[i]] = target[tKeys[i]];
                        }

                        if (Object.keys(tDiff).length > 0) {
                            diff[tKeys[i]] = tDiff;
                        }
                    }
                }
            }
            return diff;
        }

        function finalizeMetaDiff(diff, diffMoves) {
            // At this point diff is ready and the diffMoves are complete.
            var relids = getDiffChildrenRelids(diff),
                i, sMeta, tMeta;
            if (diff.meta) {
                sMeta = diff.meta.source || {};
                tMeta = diff.meta.target || {};
                combineMoveIntoMetaDiff(sMeta, diffMoves);
                diff.meta = diffObjects(sMeta, tMeta);
            }
            for (i = 0; i < relids.length; i++) {
                finalizeMetaDiff(diff[relids[i]], diffMoves);
            }
        }

        function finalizePointerDiff(diff, diffMoves) {
            var relids = getDiffChildrenRelids(diff),
                i, sPointer, tPointer;
            if (diff.pointer) {
                sPointer = diff.pointer.source || {};
                tPointer = diff.pointer.target || {};
                /*if(diff.movedFrom && !sPointer.base && tPointer.base){
                 delete tPointer.base;
                 }*/
                combineMoveIntoPointerDiff(sPointer, diffMoves);
                diff.pointer = diffObjects(sPointer, tPointer);
            }
            for (i = 0; i < relids.length; i++) {
                finalizePointerDiff(diff[relids[i]], diffMoves);
            }
        }

        function finalizeSetDiff(diff, diffMoves) {
            var relids = getDiffChildrenRelids(diff),
                i, sSet, tSet;
            if (diff.set) {
                sSet = diff.set.source || {};
                tSet = diff.set.target || {};
                combineMoveIntoMetaDiff(sSet, diffMoves);
                diff.set = diffObjects(sSet, tSet);
            }
            for (i = 0; i < relids.length; i++) {
                finalizeSetDiff(diff[relids[i]], diffMoves);
            }
        }

        function finalizeDiff(diff, diffMoves) {
            finalizeMetaDiff(diff, diffMoves);
            finalizePointerDiff(diff, diffMoves);
            finalizeSetDiff(diff, diffMoves);
            normalize(diff);
        }

        function isEmptyNodeDiff(diff) {
            // TODO: This could probably be reversed and optimized.
            if (
                Object.keys(diff.children || {}).length > 0 ||
                Object.keys(diff.attr || {}).length > 0 ||
                Object.keys(diff.reg || {}).length > 0 ||
                Object.keys(diff.pointer || {}).length > 0 ||
                Object.keys(diff.set || {}).length > 0 ||
                diff.meta
            ) {
                return false;
            }
            return true;
        }

        function getPathOfDiff(diff, path) {
            var pathArray = path.split('/'),
                i;
            pathArray.shift();
            for (i = 0; i < pathArray.length; i++) {
                diff[pathArray[i]] = diff[pathArray[i]] || {};
                diff = diff[pathArray[i]];
            }

            return diff;
        }

        function extendDiffWithOvr(diff, oDiff) {
            var i, paths, names, j, tDiff,
                onlyBaseRemoved = function (path) {
                    var sCopy = JSON.parse(JSON.stringify(oDiff.source[path] || {})),
                        tCopy = JSON.parse(JSON.stringify(oDiff.target[path] || {}));

                    if (tCopy.base) {
                        return false;
                    }

                    delete sCopy.base;

                    return CANON.stringify(sCopy) === CANON.stringify(tCopy);
                };

            //first extend sources
            paths = Object.keys(oDiff.source || {});
            for (i = 0; i < paths.length; i++) {
                tDiff = getPathOfDiff(diff, paths[i]);
                if (tDiff.removed !== true && !onlyBaseRemoved(paths[i])) {
                    tDiff.pointer = tDiff.pointer || {source: {}, target: {}};
                    tDiff.pointer.source = tDiff.pointer.source || {};
                    tDiff.pointer.target = tDiff.pointer.target || {};
                    names = Object.keys(oDiff.source[paths[i]]);
                    for (j = 0; j < names.length; j++) {
                        tDiff.pointer.source[names[j]] = oDiff.source[paths[i]][names[j]];
                    }
                }
            }
            //then targets
            paths = Object.keys(oDiff.target || {});
            for (i = 0; i < paths.length; i++) {
                tDiff = getPathOfDiff(diff, paths[i]);
                if (tDiff.removed !== true && !onlyBaseRemoved(paths[i])) {
                    tDiff.pointer = tDiff.pointer || {source: {}, target: {}};
                    names = Object.keys(oDiff.target[paths[i]]);
                    for (j = 0; j < names.length; j++) {
                        tDiff.pointer.target[names[j]] = oDiff.target[paths[i]][names[j]];
                    }
                }
            }
        }

        function gatherObstructiveGuids(node) {
            var result = {all: {}, bases: {}},
                putParents = function (n) {
                    result.bases[self.getGuid(n)] = true;
                    while (n) {
                        result.all[self.getGuid(n)] = true;
                        n = self.getParent(n);
                    }
                };
            while (node) {
                putParents(node);
                node = self.getBase(node);
            }
            return result;
        }

        function fillMissingGuid(root, sRoot, path, diff) {
            var relids = getDiffChildrenRelids(diff),
                i,
                done,
                subComputationFinished = function (cDiff, relid) {
                    diff[relid] = cDiff;
                    return null;
                };

            for (i = 0; i < relids.length; i++) {
                done = TASYNC.call(subComputationFinished,
                    fillMissingGuid(root, sRoot, path + '/' + relids[i], diff[relids[i]]), relids[i]);
            }

            return TASYNC.call(function () {
                return TASYNC.call(function (child, sChild) {
                    if (!child) {
                        child = sChild;
                    }
                    diff.guid = self.getGuid(child);
                    diff.hash = self.getHash(child);
                    diff.oGuids = gatherObstructiveGuids(child);
                    diff.oBaseGuids = diff.oGuids.bases;
                    diff.oGuids = diff.oGuids.all;
                    return diff;
                }, self.loadByPath(root, path), self.loadByPath(sRoot, path));
            }, done);
        }

        function mergeObjects(source, target) {
            var merged = {},
                sKeys = Object.keys(source),
                tKeys = Object.keys(target),
                i;
            for (i = 0; i < sKeys.length; i++) {
                merged[sKeys[i]] = source[sKeys[i]];
            }
            for (i = 0; i < tKeys.length; i++) {
                if (sKeys.indexOf(tKeys[i]) === -1) {
                    merged[tKeys[i]] = target[tKeys[i]];
                } else {
                    if (typeof target[tKeys[i]] === typeof source[tKeys[i]] &&
                        typeof target[tKeys[i]] === 'object' && !(target instanceof Array)) {
                        merged[tKeys[i]] = mergeObjects(source[tKeys[i]], target[tKeys[i]]);
                    } else {
                        merged[tKeys[i]] = target[tKeys[i]];
                    }
                }
            }

            return merged;
        }

        function updateDiff(sourceRoot, targetRoot, yetToCompute) {
            var diff = self.nodeDiff(sourceRoot, targetRoot) || {},
                oDiff = ovrDiff(sourceRoot, targetRoot),
                getChild = function (childArray, relid) {
                    // TODO: This seems computational expensive - maybe core.loadChild is faster?
                    // TODO: Alt. created maps for sChildren and tChildren
                    for (var i = 0; i < childArray.length; i++) {
                        if (self.getRelid(childArray[i]) === relid) {
                            return childArray[i];
                        }
                    }
                    return null;
                };

            return TASYNC.call(function (sChildren, tChildren) {
                ASSERT(sChildren.length >= 0 && tChildren.length >= 0);

                sChildren.sort(compareRelids);
                tChildren.sort(compareRelids);

                var i, child, done, tDiff, guid, base,
                    childComputationFinished = function (cDiff, relid/*, d*/) {
                        diff[relid] = cDiff;
                        return null;
                    };

                tDiff = diff.children ? diff.children.removed || [] : [];
                for (i = 0; i < tDiff.length; i++) {
                    diff.childrenListChanged = true;
                    child = getChild(sChildren, tDiff[i].relid);
                    if (child) {
                        guid = self.getGuid(child);
                        // FIXME: Isn't the hash already given at childrenDiff?
                        diff[tDiff[i].relid] = {guid: guid, removed: true, hash: self.getHash(child)};
                        yetToCompute[guid] = yetToCompute[guid] || {};
                        yetToCompute[guid].from = child;
                        yetToCompute[guid].fromExpanded = false;
                    }
                }

                tDiff = diff.children ? diff.children.added || [] : [];
                for (i = 0; i < tDiff.length; i++) {
                    diff.childrenListChanged = true;
                    child = getChild(tChildren, tDiff[i].relid);
                    if (child) {
                        guid = self.getGuid(child);
                        base = self.getBase(child);
                        diff[tDiff[i].relid] = {
                            guid: guid,
                            removed: false,
                            hash: self.getHash(child),
                            pointer: {source: {}, target: {base: base === null ? null : self.getPath(base)}}
                        };
                        yetToCompute[guid] = yetToCompute[guid] || {};
                        yetToCompute[guid].to = child;
                        yetToCompute[guid].toExpanded = false;
                    }
                }

                for (i = 0; i < tChildren.length; i++) {
                    child = getChild(sChildren, self.getRelid(tChildren[i]));
                    if (child && self.getHash(tChildren[i]) !== self.getHash(child)) {
                        done = TASYNC.call(childComputationFinished,
                            updateDiff(child, tChildren[i], yetToCompute), self.getRelid(child), done);
                    }
                }

                return TASYNC.call(function () {
                    delete diff.children;
                    extendDiffWithOvr(diff, oDiff);

                    normalize(diff);

                    if (Object.keys(diff).length > 0) {
                        diff.guid = self.getGuid(targetRoot);
                        diff.hash = self.getHash(targetRoot);
                        diff.oGuids = gatherObstructiveGuids(targetRoot);
                        diff.oBaseGuids = diff.oGuids.bases;
                        diff.oGuids = diff.oGuids.all;
                        return TASYNC.call(function (finalDiff) {
                            return finalDiff;
                        }, fillMissingGuid(targetRoot, sourceRoot, '', diff));
                    } else {
                        return diff;
                    }

                }, done);
            }, self.loadChildren(sourceRoot), self.loadChildren(targetRoot));
        }

        function expandDiff(root, isDeleted, yetToCompute) {
            var diff = {
                guid: self.getGuid(root),
                hash: self.getHash(root),
                removed: isDeleted === true
            };
            return TASYNC.call(function (children) {
                var guid;
                for (var i = 0; i < children.length; i++) {
                    guid = self.getGuid(children[i]);
                    diff[self.getRelid(children[i])] = {
                        guid: guid,
                        hash: self.getHash(children[i]),
                        removed: isDeleted === true
                    };

                    if (isDeleted) {
                        yetToCompute[guid] = yetToCompute[guid] || {};
                        yetToCompute[guid].from = children[i];
                        yetToCompute[guid].fromExpanded = false;
                    } else {
                        yetToCompute[guid] = yetToCompute[guid] || {};
                        yetToCompute[guid].to = children[i];
                        yetToCompute[guid].toExpanded = false;
                    }
                }
                return diff;
            }, self.loadChildren(root));
        }

        function insertIntoDiff(path, diff, sDiff) {
            var pathObject = DIFF.pathToObject(path),
                pathArray = pathObject.pathArray,
                relid = pathArray.pop(),
                i;

            for (i = 0; i < pathArray.length; i++) {
                sDiff = sDiff[pathArray[i]];
            }
            //sDiff[relid] = diff;
            sDiff[relid] = mergeObjects(sDiff[relid], diff);
        }

        function removePathFromDiff(diff, path) {
            var relId, i,
                pathObject = DIFF.pathToObject(path),
                pathArray = pathObject.pathArray;

            relId = pathArray.pop();
            for (i = 0; i < pathArray.length; i++) {
                diff = diff[pathArray[i]];
            }
            delete diff[relId];
        }

        function shrinkDiff(rootDiff) {
            var _shrink = function (diff) {
                if (diff) {
                    var keys = getDiffChildrenRelids(diff),
                        i;
                    if (typeof diff.movedFrom === 'string') {
                        removePathFromDiff(rootDiff, diff.movedFrom);
                    }

                    if (diff.removed !== false || typeof diff.movedFrom === 'string') {
                        delete diff.hash;
                    }

                    if (diff.removed === true) {
                        for (i = 0; i < keys.length; i++) {
                            delete diff[keys[i]];
                        }
                    } else {

                        for (i = 0; i < keys.length; i++) {
                            _shrink(diff[keys[i]]);
                        }
                    }
                }
            };
            _shrink(rootDiff);
        }

        function insertAtPath(diff, path, object) {
            ASSERT(typeof path === 'string');
            var i, base,
                pathObject = DIFF.pathToObject(path),
                relid = pathObject.pathArray.pop();

            base = diff;
            for (i = 0; i < pathObject.pathArray.length; i += 1) {
                base[pathObject.pathArray[i]] = base[pathObject.pathArray[i]] || {};
                base = base[pathObject.pathArray[i]];
            }
            base[relid] = JSON.parse(JSON.stringify(object));
            return;
        }

        function checkRound(yetToCompute, diff, diffMoves, needChecking) {
            var guids = Object.keys(yetToCompute),
                done,
                ytc,
                i,
                computingMove = function (mDiff, info) {
                    mDiff.guid = self.getGuid(info.from);
                    mDiff.movedFrom = self.getPath(info.from);
                    mDiff.ooGuids = gatherObstructiveGuids(info.from);
                    mDiff.ooBaseGuids = mDiff.ooGuids.bases;
                    mDiff.ooGuids = mDiff.ooGuids.all;
                    diffMoves[self.getPath(info.from)] = self.getPath(info.to);
                    insertAtPath(diff, self.getPath(info.to), mDiff);
                    return null;
                },
                expandFrom = function (mDiff, info) {
                    mDiff.hash = self.getHash(info.from);
                    mDiff.removed = true;
                    insertIntoDiff(self.getPath(info.from), mDiff, diff);
                    return null;
                },
                expandTo = function (mDiff, info) {
                    if (!mDiff.hash) {
                        mDiff.hash = self.getHash(info.to);
                    }
                    mDiff.removed = false;
                    insertIntoDiff(self.getPath(info.to), mDiff, diff);
                    return null;
                };

            if (needChecking !== true || guids.length < 1) {
                shrinkDiff(diff);
                finalizeDiff(diff, diffMoves);
                return JSON.parse(JSON.stringify(diff));
            }

            needChecking = false;
            for (i = 0; i < guids.length; i++) {
                ytc = yetToCompute[guids[i]];
                if (ytc.from && ytc.to) {
                    //move
                    needChecking = true;
                    delete yetToCompute[guids[i]];
                    done = TASYNC.call(computingMove, updateDiff(ytc.from, ytc.to, yetToCompute), ytc);
                } else {
                    if (ytc.from && ytc.fromExpanded === false) {
                        //expand from
                        ytc.fromExpanded = true;
                        needChecking = true;
                        done = TASYNC.call(expandFrom, expandDiff(ytc.from, true, yetToCompute), ytc);
                    } else if (ytc.to && ytc.toExpanded === false) {
                        //expand to
                        ytc.toExpanded = true;
                        needChecking = true;
                        done = TASYNC.call(expandTo, expandDiff(ytc.to, false, yetToCompute), ytc);
                    }
                }
            }

            return TASYNC.call(checkRound, yetToCompute, diff, diffMoves, needChecking, done);
        }

        function hasRealChange(diffNode) {
            var keys = Object.keys(diffNode || {}),
                searchedKeywords = {
                    hash: true,
                    attr: true,
                    reg: true,
                    pointer: true,
                    set: true,
                    meta: true,
                    movedFrom: true,
                    removed: true
                },
                i;

            for (i = 0; i < keys.length; i += 1) {
                if (searchedKeywords[keys[i]]) {
                    return true;
                }
            }

            return false;
        }

        function getMoveSources(diff, path, toFrom, fromTo) {
            var relids = getDiffChildrenRelids(diff),
                i;

            for (i = 0; i < relids.length; i++) {
                getMoveSources(diff[relids[i]], path + '/' + relids[i], toFrom, fromTo);
            }

            if (typeof diff.movedFrom === 'string') {
                toFrom[path] = diff.movedFrom;
                fromTo[diff.movedFrom] = path;
            }
        }

        function getParentPath(path) {
            path = path.split(CONSTANTS.PATH_SEP);
            path.splice(-1, 1);
            return path.join(CONSTANTS.PATH_SEP);
        }

        function getNodeByGuid(diff, guid) {
            var relids, i, node;

            if (REGEXP.GUID.test(guid) !== true) {
                return null;
            }

            if (diff.guid === guid) {
                return diff;
            }

            relids = getDiffChildrenRelids(diff);
            for (i = 0; i < relids.length; i++) {
                node = getNodeByGuid(diff[relids[i]], guid);
                if (node) {
                    return node;
                }
            }
            return null;
        }

        function _getPathOfGuidR(diff, guid, path) {
            var relids, i, result;

            if (diff.guid === guid) {
                return path;
            }

            relids = getDiffChildrenRelids(diff);
            for (i = 0; i < relids.length; i++) {
                result = _getPathOfGuidR(diff[relids[i]], guid, path + CONSTANTS.PATH_SEP + relids[i]);
                if (result !== null) {
                    return result;
                }
            }

            return null;
        }

        function getPathOfGuid(diff, guid) {

            if (REGEXP.GUID.test(guid) !== true) {
                return null;
            }
            return _getPathOfGuidR(diff, guid, '');
        }

        function getRelidFromPath(path) {
            path = path.split(CONSTANTS.PATH_SEP);
            return path.splice(-1, 1)[0];
        }

        function getParentGuid(diff, path) {
            return getPathOfDiff(diff, getParentPath(path)).guid || null;
        }

        function fixInheritanceCollision(path, diffBase, diffExtension, moveBase) {
            // a generic approach to check for complex collisions, when the same
            // path is being created by changes in the base of some container and
            // inside the container by either move or creation
            // also it moves new nodes whenever any of its container changed base -
            // not necessarily able to figure out, so it is safer to reallocate relid in this rare case
            var i,
                diff = getPathOfDiff(diffBase, path),
                keys = getDiffChildrenRelids(diff),
                newRelid,
                newPath,
                parent,
                src2dst,
                dst2src,
                checkContainer = function (containerGuid, relativePath, dataKnownInExtension) {
                    var diff, path, containerDiff, baseGuids, i, baseDiff;

                    if (dataKnownInExtension) {
                        diff = diffExtension;
                        path = getPathOfGuid(diff, containerGuid);
                        containerDiff = getNodeByGuid(diffBase, containerGuid);
                    } else {
                        containerDiff = getNodeByGuid(diffExtension, containerGuid);
                        if (containerDiff === null) {
                            containerDiff = getNodeByGuid(diffBase, containerGuid);
                            diff = diffBase;
                            path = getPathOfGuid(diff, containerGuid);
                        } else {
                            dataKnownInExtension = true;
                            diff = diffExtension;
                            path = getPathOfGuid(diff, containerGuid);
                        }
                    }

                    baseGuids = Object.keys(containerDiff.oBaseGuids || {})
                        .concat(Object.keys(containerDiff.ooBaseGuids || {}));

                    for (i = 0; i < baseGuids.length; i += 1) {
                        baseDiff = getPathOfDiff(getNodeByGuid(diffExtension, baseGuids[i]) || {}, relativePath);
                        if (baseDiff.removed === false || typeof baseDiff.movedFrom === 'string') {
                            //the base exists / changed and new at the given path
                            return true;
                        }
                    }

                    if (dataKnownInExtension &&
                        containerDiff.pointer &&
                        typeof containerDiff.pointer.base === 'string') {
                        // the base changed its base
                        return true;
                    }
                    //this parent was fine, so let's go to the next one - except the root, that we do not have to check
                    relativePath = CONSTANTS.PATH_SEP + getRelidFromPath(path) + relativePath;
                    if (getParentPath(path)) {
                        // we should stop before the ROOT
                        return checkContainer(getParentGuid(diff, path), relativePath, dataKnownInExtension);
                    }

                    return false;
                };

            if (diff.removed === false || typeof diff.movedFrom === 'string') {
                // this is a new node at the given place, so let's check for base collisions
                if (checkContainer(getParentGuid(diffBase, path), CONSTANTS.PATH_SEP + getRelidFromPath(path), '')) {
                    // we have to move the node
                    if (moveBase === true) {
                        dst2src = _concatMoves.getBaseSourceFromDestination;
                        src2dst = _concatMoves.getBaseDestinationFromSource;
                    } else {
                        dst2src = _concatMoves.getExtensionSourceFromDestination;
                        src2dst = _concatMoves.getExtensionDestinationFromSource;
                    }

                    //TODO is there a safer way to ensure no collision with the new relid
                    newRelid = RANDOM.generateRelid({}, CONSTANTS.MAXIMUM_STARTING_RELID_LENGTH);
                    newPath = getParentPath(path) + '/' + newRelid;

                    //now the actual place switching
                    parent = getPathOfDiff(diffBase, getParentPath(path));
                    parent[newRelid] = diff;
                    parent[newRelid].collidingRelid = getRelidFromPath(path);
                    delete parent[getRelidFromPath(path)];
                    dst2src[newPath] = dst2src[path];
                    delete dst2src[path];
                    src2dst[dst2src[newPath]] = newPath;
                }
            }

            for (i = 0; i < keys.length; i += 1) {
                fixInheritanceCollision(path + CONSTANTS.PATH_SEP + keys[i], diffBase, diffExtension, moveBase);
            }
        }

        function fixCollision(path, relid, diffBase, diffExtension) {
            //a generic approach, to check if both diff has the same path
            // but for a different node
            //there is three types of path equality:
            //1. same guids -> same node
            //2. both was moved -> different nodes
            //3. one was moved and the other is created ->different nodes (here we always have to generate
            // new relid to the moved one)
            //4. both was created (we have to generate relid to one of them)
            var i,
                keys = getDiffChildrenRelids(diffBase),
                globalDiff,
                newRelid,
                newPath,
                nodeDiff,
                relids,
                dst2src,
                src2dst,
                relidObj = {},
                parent;

            if (diffBase.guid !== diffExtension.guid &&
                (typeof diffBase.guid === 'string' && typeof diffExtension.guid === 'string')) {
                if (diffBase.movedFrom && diffExtension.movedFrom) {
                    //relocate the extension
                    globalDiff = _concatExtension;
                    nodeDiff = diffExtension;
                    dst2src = _concatMoves.getExtensionSourceFromDestination;
                    src2dst = _concatMoves.getExtensionDestinationFromSource;
                } else if (diffBase.movedFrom && diffExtension.removed === false) {
                    globalDiff = _concatBase;
                    nodeDiff = diffBase;
                    dst2src = _concatMoves.getBaseSourceFromDestination;
                    src2dst = _concatMoves.getBaseDestinationFromSource;
                } else if (diffExtension.movedFrom && diffBase.removed === false) {
                    globalDiff = _concatExtension;
                    nodeDiff = diffExtension;
                    dst2src = _concatMoves.getExtensionSourceFromDestination;
                    src2dst = _concatMoves.getExtensionDestinationFromSource;
                } else if (diffBase.removed === false && diffExtension.removed === false) {
                    globalDiff = _concatExtension;
                    nodeDiff = diffExtension;
                    dst2src = _concatMoves.getExtensionSourceFromDestination;
                    src2dst = _concatMoves.getExtensionDestinationFromSource;
                } else {
                    throw new Error('there is a guid mismatch among the two diffs: ' +
                        diffBase.guid + ' vs ' + diffExtension.guid);
                }

                relids = getDiffChildrenRelids(getPathOfDiff(_concatBase, getParentPath(path)))
                    .concat(getDiffChildrenRelids(getPathOfDiff(_concatExtension, getParentPath(path))));

                relidObj = {};
                for (i = 0; i < relids.length; i += 1) {
                    relidObj[relids[i]] = {};
                }
                // TODO: Could this lead to collisions on bases/instances?
                newRelid = RANDOM.generateRelid(relidObj);
                newPath = getParentPath(path) + '/' + newRelid;

                //now the actual place switching
                parent = getPathOfDiff(globalDiff, getParentPath(path));
                parent[newRelid] = nodeDiff;
                parent[newRelid].collidingRelid = relid;
                delete parent[relid];
                dst2src[newPath] = dst2src[path];
                delete dst2src[path];
                src2dst[dst2src[newPath]] = newPath;
            }

            //recursive calls - only if there were no replacement due to collision
            for (i = 0; i < keys.length; i += 1) {
                if (diffExtension[keys[i]]) {
                    fixCollision(path + '/' + keys[i], keys[i], diffBase[keys[i]], diffExtension[keys[i]]);
                }
            }
        }

        function getAncestorPath(onePath, otherPath) {
            var ancestorPath = '',
                onePathArray = onePath.split('/'),
                otherPathArray = otherPath.split('/'),
                i = 0;
            onePathArray.shift();
            otherPathArray.shift();
            if (onePathArray.length > 0 && otherPathArray.length > 0) {
                while (i < onePathArray.length && onePathArray[i] === otherPathArray[i]) {
                    ancestorPath += '/' + onePathArray[i];
                    i += 1;
                }
            }
            return ancestorPath;
        }

        function setBaseOfNewNode(root, nodePath, basePath) {
            var ancestorPath = getAncestorPath(nodePath, basePath);
            return TASYNC.call(function (node) {
                var sourcePath = nodePath.substr(ancestorPath.length),
                    targetPath = basePath.substr(ancestorPath.length);
                innerCore.overlayInsert(node, sourcePath, 'base', targetPath);
            }, self.loadByPath(root, ancestorPath));
        }

        function getOrderedRelids(diffObject) {
            //those nodes that were changing relid as a result of move should be handled last
            var keys = getDiffChildrenRelids(diffObject),
                i,
                ordered = [],
                sourceRelid;
            for (i = 0; i < keys.length; i += 1) {
                if (diffObject[keys[i]].movedFrom) {
                    sourceRelid = diffObject[keys[i]].movedFrom;
                    sourceRelid = sourceRelid.split('/');
                    sourceRelid = sourceRelid[sourceRelid.length - 1];
                    if (sourceRelid !== keys[i]) {
                        ordered.push(keys[i]);
                    } else {
                        ordered.unshift(keys[i]);
                    }
                } else {
                    ordered.unshift(keys[i]);
                }
            }
            return ordered;
        }

        function makeInitialContainmentChanges(node, diff) {
            var relids = getOrderedRelids(diff),
                i, done, child, moved,
                moving = function (n, di, r, p, m, a/*, d*/) {
                    var nRelid;
                    if (m === true) {
                        n = self.moveNode(n, p);
                        nRelid = self.getRelid(n);

                        if (r !== nRelid) {
                            //we have to make additional changes to our move table
                            diff[nRelid] = JSON.parse(JSON.stringify(diff[r]));
                            delete diff[r];
                        }
                    }
                    return makeInitialContainmentChanges(n, di, a);
                };

            for (i = 0; i < relids.length; i++) {
                moved = false;
                if (diff[relids[i]].movedFrom) {
                    //moved node
                    moved = true;
                    child = self.loadByPath(self.getRoot(node), diff[relids[i]].movedFrom);
                    done = TASYNC.call(moving, child, diff[relids[i]], relids[i], node, moved, done);
                } else if (diff[relids[i]].removed === false) {
                    //added node
                    if (diff[relids[i]].hash) {
                        self.setProperty(node, relids[i], diff[relids[i]].hash);
                        node.childrenRelids = null;
                    }
                } else {
                    //simple node
                    child = self.loadChild(node, relids[i]);
                    done = TASYNC.call(moving, child, diff[relids[i]], relids[i], node, moved, done);
                }
            }

            return TASYNC.call(function (/*d*/) {
                return null;
            }, done);
        }

        function setBaseRelationsOfNewNodes(root, path, diff, added) {
            var relids = getOrderedRelids(diff),
                i,
                children = [],
                newNode = false;

            for (i = 0; i < relids.length; i += 1) {
                if ((diff[relids[i]].removed === false || added) &&
                    diff[relids[i]].pointer && diff[relids[i]].pointer.base) {
                    newNode = true;
                    children[i] = TASYNC.join(
                        setBaseOfNewNode(root, path + '/' + relids[i], diff[relids[i]].pointer.base),
                        setBaseRelationsOfNewNodes(root, path + '/' + relids[i], diff[relids[i]], added || newNode)
                    );
                } else {
                    children[i] = TASYNC.call(
                        setBaseRelationsOfNewNodes, root, path + '/' + relids[i], diff[relids[i]], added
                    );
                }
            }

            return TASYNC.lift(children);
        }

        function applyAttributeChanges(node, attrDiff) {
            var i, keys;
            keys = Object.keys(attrDiff);
            for (i = 0; i < keys.length; i++) {
                if (attrDiff[keys[i]] === CONSTANTS.TO_DELETE_STRING) {
                    self.delAttribute(node, keys[i]);
                } else {
                    self.setAttribute(node, keys[i], attrDiff[keys[i]]);
                }
            }
        }

        function applyRegistryChanges(node, regDiff) {
            var i, keys;
            keys = Object.keys(regDiff);
            for (i = 0; i < keys.length; i++) {
                if (regDiff[keys[i]] === CONSTANTS.TO_DELETE_STRING) {
                    self.delRegistry(node, keys[i]);
                } else {
                    self.setRegistry(node, keys[i], regDiff[keys[i]]);
                }
            }
        }

        function setPointer(node, name, target) {
            var targetNode;
            if (target === null) {
                targetNode = null;
            } else {
                targetNode = self.loadByPath(self.getRoot(node), target);
            }
            return TASYNC.call(function (t) {
                //TODO watch if handling of base changes!!!
                self.setPointer(node, name, t);
                return;
            }, targetNode);
        }

        function applyPointerChanges(node, diff) {
            var done,
                pointerDiff = diff.pointer || {},
                keys = Object.keys(pointerDiff),
                i;
            for (i = 0; i < keys.length; i++) {
                if (pointerDiff[keys[i]] === CONSTANTS.TO_DELETE_STRING) {
                    self.deletePointer(node, keys[i]);
                } else if (diff.removed !== false || keys[i] !== 'base') {
                    done = setPointer(node, keys[i], pointerDiff[keys[i]]);
                }
            }

            return TASYNC.call(function (/*d*/) {
                return null;
            }, done);

        }

        function addMember(node, name, target, data) {
            var memberAttrSetting = function (diff) {
                    var keys, i;

                    keys = Object.keys(diff);
                    for (i = 0; i < keys.length; i++) {
                        if (diff[keys[i]] === CONSTANTS.TO_DELETE_STRING) {
                            self.delMemberAttribute(node, name, target, keys[i]);
                        } else {
                            self.setMemberAttribute(node, name, target, keys[i], diff[keys[i]]);
                        }
                    }
                },
                memberRegSetting = function (diff) {
                    var keys, i;

                    keys = Object.keys(diff);
                    for (i = 0; i < keys.length; i++) {
                        if (diff[keys[i]] === CONSTANTS.TO_DELETE_STRING) {
                            self.delMemberRegistry(node, name, target, keys[i]);
                        } else {
                            self.setMemberRegistry(node, name, target, keys[i], diff[keys[i]]);
                        }
                    }
                };
            return TASYNC.call(function (t) {
                self.addMember(node, name, t);
                memberAttrSetting(data.attr || {});
                memberRegSetting(data.reg || {});
                return;
            }, self.loadByPath(self.getRoot(node), target));
        }

        function applySetChanges(node, setDiff) {
            var done,
                setNames = Object.keys(setDiff),
                elements, i, j;
            for (i = 0; i < setNames.length; i++) {
                if (setDiff[setNames[i]] === CONSTANTS.TO_DELETE_STRING) {
                    self.deleteSet(node, setNames[i]);
                } else {
                    self.createSet(node, setNames[i]);
                    if (Object.keys(setDiff[setNames[i]].attr || {}).length > 0) {
                        elements = Object.keys(setDiff[setNames[i]].attr);
                        for (j = 0; j < elements.length; j += 1) {
                            if (setDiff[setNames[i]].attr[elements[j]] === CONSTANTS.TO_DELETE_STRING) {
                                self.delSetAttribute(node, setNames[i], elements[j]);
                            } else {
                                self.setSetAttribute(node, setNames[i], elements[j],
                                    setDiff[setNames[i]].attr[elements[j]]);
                            }
                        }
                    }
                    if ((Object.keys(setDiff[setNames[i]].reg || {})).length > 0) {
                        elements = Object.keys(setDiff[setNames[i]].reg);
                        for (j = 0; j < elements.length; j += 1) {
                            if (setDiff[setNames[i]].reg[elements[j]] === CONSTANTS.TO_DELETE_STRING) {
                                self.delSetRegistry(node, setNames[i], elements[j]);
                            } else {
                                self.setSetRegistry(node, setNames[i], elements[j],
                                    setDiff[setNames[i]].reg[elements[j]]);
                            }
                        }
                    }

                    elements = Object.keys(setDiff[setNames[i]]);
                    for (j = 0; j < elements.length; j++) {
                        if (RANDOM.isValidPath(elements[j])) {
                            if (setDiff[setNames[i]][elements[j]] === CONSTANTS.TO_DELETE_STRING) {
                                self.delMember(node, setNames[i], elements[j]);
                            } else {
                                done = addMember(node, setNames[i], elements[j], setDiff[setNames[i]][elements[j]]);
                            }
                        }
                    }
                }
            }

            return TASYNC.call(function (/*d*/) {
                return null;
            }, done);

        }

        function jsonConcat(base, extension) {
            var baseKeys = Object.keys(base),
                extKeys = Object.keys(extension),
                concat = JSON.parse(JSON.stringify(base)),
                i;
            for (i = 0; i < extKeys.length; i++) {
                if (baseKeys.indexOf(extKeys[i]) === -1) {
                    concat[extKeys[i]] = JSON.parse(JSON.stringify(extension[extKeys[i]]));
                } else {
                    if (typeof base[extKeys[i]] === 'object' && typeof extension[extKeys[i]] === 'object') {
                        concat[extKeys[i]] = jsonConcat(base[extKeys[i]], extension[extKeys[i]]);
                    } else { //either from value to object or object from value we go with the extension
                        concat[extKeys[i]] = JSON.parse(JSON.stringify(extension[extKeys[i]]));
                    }
                }
            }
            return concat;
        }

        function applyMetaAttributes(node, metaAttrDiff) {
            var i, keys, newValue;
            if (metaAttrDiff === CONSTANTS.TO_DELETE_STRING) {
                //we should delete all MetaAttributes
                keys = self.getValidAttributeNames(node);
                for (i = 0; i < keys.length; i++) {
                    self.delAttributeMeta(node, keys[i]);
                }
            } else {
                keys = Object.keys(metaAttrDiff);
                for (i = 0; i < keys.length; i++) {
                    if (metaAttrDiff[keys[i]] === CONSTANTS.TO_DELETE_STRING) {
                        self.delAttributeMeta(node, keys[i]);
                    } else {
                        newValue = jsonConcat(self.getAttributeMeta(node, keys[i]) || {}, metaAttrDiff[keys[i]]);
                        self.setAttributeMeta(node, keys[i], newValue);
                    }
                }
            }
        }

        function applyMetaConstraints(node, metaConDiff) {
            var keys, i;
            if (metaConDiff === CONSTANTS.TO_DELETE_STRING) {
                //remove all constraints
                keys = self.getConstraintNames(node);
                for (i = 0; i < keys.length; i++) {
                    self.delConstraint(node, keys[i]);
                }
            } else {
                keys = Object.keys(metaConDiff);
                for (i = 0; i < keys.length; i++) {
                    if (metaConDiff[keys[i]] === CONSTANTS.TO_DELETE_STRING) {
                        self.delConstraint(node, keys[i]);
                    } else {
                        self.setConstraint(node, keys[i], jsonConcat(self.getConstraint(node, keys[i]) || {},
                            metaConDiff[keys[i]]));
                    }
                }
            }
        }

        function applyMetaChildren(node, metaChildrenDiff) {
            var keys, i, done,
                setChild = function (target, data/*, d*/) {
                    self.setChildMeta(node, target, data.min, data.max);
                };
            if (metaChildrenDiff === CONSTANTS.TO_DELETE_STRING) {
                //remove all valid child
                keys = self.getValidChildrenPaths(node);
                for (i = 0; i < keys.length; i++) {
                    self.delChildMeta(node, keys[i]);
                }
            } else {
                self.setChildrenMetaLimits(node, metaChildrenDiff.min, metaChildrenDiff.max);
                delete metaChildrenDiff.max; //TODO we do not need it anymore, but maybe there is a better way
                delete metaChildrenDiff.min;
                keys = Object.keys(metaChildrenDiff);
                for (i = 0; i < keys.length; i++) {
                    if (metaChildrenDiff[keys[i]] === CONSTANTS.TO_DELETE_STRING) {
                        self.delChildMeta(node, keys[i]);
                    } else {
                        done = TASYNC.call(setChild, self.loadByPath(self.getRoot(node), keys[i]),
                            metaChildrenDiff[keys[i]], done);
                    }
                }
            }

            TASYNC.call(function (/*d*/) {
                return null;
            }, done);
        }

        function applyMetaPointers(node, metaPointerDiff) {
            var names, targets, i, j, done,
                setPointer = function (name, target, data/*, d*/) {
                    self.setPointerMetaTarget(node, name, target, data.min, data.max);
                };
            if (metaPointerDiff === CONSTANTS.TO_DELETE_STRING) {
                //remove all pointers,sets and their targets
                names = self.getValidPointerNames(node);
                for (i = 0; i < names.length; i++) {
                    self.delPointerMeta(node, names[i]);
                }

                names = self.getValidSetNames(node);
                for (i = 0; i < names.length; i++) {
                    self.delPointerMeta(node, names[i]);
                }
                return;
            }

            names = Object.keys(metaPointerDiff);
            for (i = 0; i < names.length; i++) {
                if (metaPointerDiff[names[i]] === CONSTANTS.TO_DELETE_STRING) {
                    self.delPointerMeta(node, names[i]);
                } else {
                    self.setPointerMetaLimits(node, names[i], metaPointerDiff[names[i]].min,
                        metaPointerDiff[names[i]].max);
                    //TODO we do not need it anymore, but maybe there is a better way
                    delete metaPointerDiff[names[i]].max;
                    delete metaPointerDiff[names[i]].min;
                    targets = Object.keys(metaPointerDiff[names[i]]);
                    for (j = 0; j < targets.length; j++) {
                        if (metaPointerDiff[names[i]][targets[j]] === CONSTANTS.TO_DELETE_STRING) {
                            self.delPointerMetaTarget(node, names[i], targets[j]);
                        } else {
                            done = TASYNC.call(setPointer, names[i], self.loadByPath(self.getRoot(node), targets[j]),
                                metaPointerDiff[names[i]][targets[j]], done);
                        }
                    }
                }
            }

            TASYNC.call(function (/*d*/) {
                return null;
            }, done);
        }

        function applyMetaAspects(node, metaAspectsDiff) {
            var names, targets, i, j, done,
                setAspect = function (name, target/*, d*/) {
                    self.setAspectMetaTarget(node, name, target);
                };
            if (metaAspectsDiff === CONSTANTS.TO_DELETE_STRING) {
                //remove all aspects
                names = self.getValidAspectNames(node);
                for (i = 0; i < names.length; i++) {
                    self.delAspectMeta(node, names[i]);
                }
                return;
            }

            names = Object.keys(metaAspectsDiff);
            for (i = 0; i < names.length; i++) {
                if (metaAspectsDiff[names[i]] === CONSTANTS.TO_DELETE_STRING) {
                    self.delAspectMeta(node, names[i]);
                } else {
                    targets = metaAspectsDiff[names[i]];
                    for (j = 0; j < targets.length; j++) {
                        if (metaAspectsDiff[names[i]][targets[j]] === CONSTANTS.TO_DELETE_STRING) {
                            self.delAspectMetaTarget(node, names[i], targets[j]);
                        } else {
                            done = TASYNC.call(setAspect, names[i], self.loadByPath(self.getRoot(node), targets[j]),
                                done);
                        }
                    }
                }
            }

            TASYNC.call(function (/*d*/) {
                return null;
            }, done);
        }

        function applyMetaChanges(node, metaDiff) {
            var done;
            applyMetaAttributes(node, metaDiff.attributes || CONSTANTS.TO_DELETE_STRING);
            applyMetaConstraints(node, metaDiff.constraints || CONSTANTS.TO_DELETE_STRING);
            done = applyMetaChildren(node, metaDiff.children || CONSTANTS.TO_DELETE_STRING);
            done = TASYNC.call(applyMetaPointers, node, metaDiff.pointers || CONSTANTS.TO_DELETE_STRING, done);
            done = TASYNC.call(applyMetaAspects, node, metaDiff.aspects || CONSTANTS.TO_DELETE_STRING, done);

            TASYNC.call(function (/*d*/) {
                return null;
            }, done);
        }

        function applyNodeChange(root, path, nodeDiff) {
            //check for move
            var node;

            node = self.loadByPath(root, path);

            return TASYNC.call(function (n) {
                var done,
                    relids = getDiffChildrenRelids(nodeDiff),
                    i;
                if (n === null) {
                    logger.warn('Missing node [' + path + '] during patch application. ' +
                        'Could be a conflicting conflict resolution.');
                    return;
                }
                if (nodeDiff.removed === true) {
                    self.deleteNode(n);
                    return;
                }
                applyAttributeChanges(n, nodeDiff.attr || {});
                applyRegistryChanges(n, nodeDiff.reg || {});
                done = applyPointerChanges(n, nodeDiff);
                done = TASYNC.call(applySetChanges, n, nodeDiff.set || {}, done);
                if (nodeDiff.meta) {
                    delete nodeDiff.meta.empty;
                    done = TASYNC.call(applyMetaChanges, n, nodeDiff.meta, done);
                }
                for (i = 0; i < relids.length; i++) {
                    done = TASYNC.call(function () {
                        return null;
                    }, applyNodeChange(root, path + '/' + relids[i], nodeDiff[relids[i]]), done);
                    // done = TASYNC.join(done, applyNodeChange(root, path + '/' + relids[i], nodeDiff[relids[i]]));
                }
                /*TASYNC.call(function (d) {
                 return done;
                 }, done);*/

                //we should check for possible guid change and restore the expected guid
                if (self.getGuid(n) !== nodeDiff.guid && nodeDiff.guid) {
                    done = TASYNC.call(function () {
                        return null;
                    }, self.setGuid(n, nodeDiff.guid), done);
                }
                return done;
            }, node);
        }

        function getSingleNode(node) {
            //removes the children from the node
            var result = JSON.parse(JSON.stringify(node)),
                keys = getDiffChildrenRelids(result),
                i;
            for (i = 0; i < keys.length; i++) {
                delete result[keys[i]];
            }
            //changeMovedPaths(result);
            return result;
        }

        //FIXME are we going to use this function
        //function getConflictByGuid(conflict, guid) {
        //    var relids, i, result;
        //    if (conflict.guid === guid) {
        //        return conflict;
        //    }
        //    relids = getDiffChildrenRelids(conflict);
        //    for (i = 0; i < relids.length; i++) {
        //        result = getConflictByGuid(conflict[relids[i]], guid);
        //        if (result) {
        //            return result;
        //        }
        //    }
        //    return null;
        //}

        //now we try a different approach, which maybe more simple
        function getCommonPathForConcat(path) {
            if (_concatMoves.getExtensionSourceFromDestination[path]) {
                path = _concatMoves.getExtensionSourceFromDestination[path];
            }
            if (_concatMoves.getBaseDestinationFromSource[path]) {
                path = _concatMoves.getBaseDestinationFromSource[path];
            }
            return path;
        }

        function getConcatBaseRemovals(diff) {
            var relids = getDiffChildrenRelids(diff),
                i;
            if (diff.removed !== true) {
                if (diff.movedFrom) {
                    if (_concatBaseRemovals[diff.guid] !== undefined) {
                        delete _concatBaseRemovals[diff.guid];
                    } else {
                        _concatBaseRemovals[diff.guid] = false;
                    }
                }
                for (i = 0; i < relids.length; i++) {
                    getConcatBaseRemovals(diff[relids[i]]);
                }
            } else {
                if (_concatBaseRemovals[diff.guid] === false) {
                    delete _concatBaseRemovals[diff.guid];
                } else {
                    _concatBaseRemovals[diff.guid] = true;
                }
            }
        }

        function completeConcatBase(baseDiff, extensionDiff) {
            var recursiveComplete = function (base, extension, newItem) {
                var i, keys;
                if (newItem === true) {
                    if (extension.guid) {
                        base.guid = extension.guid;
                    }
                    if (extension.oGuids) {
                        base.oGuids = extension.oGuids;
                    }
                    if (extension.ooGuids) {
                        base.ooGuids = extension.ooGuids;
                    }

                    if (extension.oBaseGuids) {
                        base.oBaseGuids = extension.oBaseGuids;
                    }
                    if (extension.ooBaseGuids) {
                        base.ooBaseGuids = extension.ooBaseGuids;
                    }

                    if (typeof extension.removed === 'boolean' && !extension.removed) {
                        base.removed = extension.removed;
                    }

                    if (extension.hash) {
                        base.hash = extension.hash;
                    }

                    if (extension.childrenListChanged) {
                        base.childrenListChanged = true;
                    }
                }

                keys = getDiffChildrenRelids(extension);
                for (i = 0; i < keys.length; i += 1) {
                    if (base[keys[i]] === undefined) {
                        if (typeof extension[keys[i]].movedFrom !== 'string') {
                            base[keys[i]] = {};
                            recursiveComplete(base[keys[i]], extension[keys[i]], true);
                        }
                    } else {
                        recursiveComplete(base[keys[i]], extension[keys[i]], false);
                    }
                }
            };

            recursiveComplete(baseDiff, extensionDiff, Object.keys(baseDiff).length === 0);
        }

        function getObstructiveGuids(diffNode) {
            var result = [],
                keys, i;
            keys = Object.keys(diffNode.oGuids || {});
            for (i = 0; i < keys.length; i++) {
                if (_concatBaseRemovals[keys[i]]) {
                    result.push(keys[i]);
                }
            }
            keys = Object.keys(diffNode.ooGuids || {});
            for (i = 0; i < keys.length; i++) {
                if (_concatBaseRemovals[keys[i]]) {
                    result.push(keys[i]);
                }
            }
            return result;
        }

        function getWhomIObstructGuids(guid) {
            //this function is needed when the extension contains a deletion where the base did not delete the node
            var guids = [],
                checkNode = function (diffNode) {
                    var relids, i;
                    if ((diffNode.oGuids && diffNode.oGuids[guid]) || (diffNode.ooGuids && diffNode.ooGuids[guid])) {
                        guids.push(diffNode.guid);
                    }

                    relids = getDiffChildrenRelids(diffNode);
                    for (i = 0; i < relids.length; i++) {
                        checkNode(diffNode[relids[i]]);
                    }
                };
            checkNode(_concatBase);
            return guids;
        }

        function gatherFullMetaConflicts(diffMeta, mine, path, opposingPath) {
            var conflict, opposingConflict,
                relids, i, j, keys, tPath, key;

            if (mine) {
                conflict = _conflictMine;
                opposingConflict = _conflictTheirs[opposingPath];
            } else {
                conflict = _conflictTheirs;
                opposingConflict = _conflictMine[opposingPath];
            }

            if (diffMeta === CONSTANTS.TO_DELETE_STRING) {
                conflict[path] = conflict[path] || {value: CONSTANTS.TO_DELETE_STRING, conflictingPaths: {}};
                conflict[path].conflictingPaths[opposingPath] = true;
                opposingConflict.conflictingPaths[path] = true;
                return; //there is no other conflict
            }

            //children
            if (diffMeta.children) {
                if (diffMeta.children === CONSTANTS.TO_DELETE_STRING) {
                    conflict[path + '/children'] = conflict[path + '/children'] || {
                            value: CONSTANTS.TO_DELETE_STRING,
                            conflictingPaths: {}
                        };
                    conflict[path + '/children'].conflictingPaths[opposingPath] = true;
                    opposingConflict.conflictingPaths[path + '/children'] = true;
                } else {
                    if (diffMeta.children.max) {
                        conflict[path + '/children/max'] = conflict[path + '/children/max'] || {
                                value: diffMeta.children.max,
                                conflictingPaths: {}
                            };
                        conflict[path + '/children/max'].conflictingPaths[opposingPath] = true;
                        opposingConflict.conflictingPaths[path + '/children/max'] = true;
                    }
                    if (diffMeta.children.min) {
                        conflict[path + '/children/min'] = conflict[path + '/children/min'] || {
                                value: diffMeta.children.min,
                                conflictingPaths: {}
                            };
                        conflict[path + '/children/min'].conflictingPaths[opposingPath] = true;
                        opposingConflict.conflictingPaths[path + '/children/min'] = true;
                    }
                    relids = getDiffChildrenRelids(diffMeta.children);
                    for (i = 0; i < relids.length; i++) {
                        conflict[path + '/children/' + relids[i]] = conflict[path + '/children/' + relids[i]] || {
                                value: diffMeta.children[relids[i]],
                                conflictingPaths: {}
                            };
                        conflict[path + '/children/' + relids[i]].conflictingPaths[opposingPath] = true;
                        opposingConflict.conflictingPaths[path + '/children/' + relids[i]] = true;
                    }
                }
            }
            //attributes
            if (diffMeta.attributes) {
                if (diffMeta.attributes === CONSTANTS.TO_DELETE_STRING) {
                    conflict[path + '/attributes'] = conflict[path + '/attributes'] || {
                            value: CONSTANTS.TO_DELETE_STRING,
                            conflictingPaths: {}
                        };
                    conflict[path + '/attributes'].conflictingPaths[opposingPath] = true;
                    opposingConflict.conflictingPaths[path + '/attributes'] = true;
                } else {
                    keys = Object.keys(diffMeta.attributes);
                    for (i = 0; i < keys.length; i++) {
                        key = path + '/attributes/' + keys[i];
                        conflict[key] = conflict[key] || {
                                value: diffMeta.attributes[keys[i]],
                                conflictingPaths: {}
                            };
                        conflict[key].conflictingPaths[opposingPath] = true;
                        opposingConflict.conflictingPaths[key] = true;
                    }
                }
            }
            //pointers
            if (diffMeta.pointers) {
                if (diffMeta.pointers === CONSTANTS.TO_DELETE_STRING) {
                    conflict[path + '/pointers'] = conflict[path + '/pointers'] || {
                            value: CONSTANTS.TO_DELETE_STRING,
                            conflictingPaths: {}
                        };
                    conflict[path + '/pointers'].conflictingPaths[opposingPath] = true;
                    opposingConflict.conflictingPaths[path + '/pointers'] = true;
                } else {
                    keys = Object.keys(diffMeta.pointers);
                    for (i = 0; i < keys.length; i++) {
                        if (diffMeta.pointers[keys[i]] === CONSTANTS.TO_DELETE_STRING) {
                            conflict[path + '/pointers/' + keys[i]] = conflict[path + '/pointers/' + keys[i]] || {
                                    value: CONSTANTS.TO_DELETE_STRING,
                                    conflictingPaths: {}
                                };
                            conflict[path + '/pointers/' + keys[i]].conflictingPaths[opposingPath] = true;
                            opposingConflict.conflictingPaths[path + '/pointers/' + keys[i]] = true;
                        } else {
                            if (diffMeta.pointers[keys[i]].max) {
                                conflict[path + '/pointers/' + keys[i] + '/max'] =
                                    conflict[path + '/pointers/' + keys[i] + '/max'] || {
                                        value: diffMeta.pointers[keys[i]].max,
                                        conflictingPaths: {}
                                    };
                                conflict[path + '/pointers/' + keys[i] + '/max'].conflictingPaths[opposingPath] = true;
                                opposingConflict.conflictingPaths[path + '/pointers/' + keys[i] + '/max'] = true;
                            }
                            if (diffMeta.pointers[keys[i]].min) {
                                conflict[path + '/pointers/' + keys[i] + '/min'] =
                                    conflict[path + '/pointers/' + keys[i] + '/min'] || {
                                        value: diffMeta.pointers[keys[i]].min,
                                        conflictingPaths: {}
                                    };
                                conflict[path + '/pointers/' + keys[i] + '/min'].conflictingPaths[opposingPath] = true;
                                opposingConflict.conflictingPaths[path + '/pointers/' + keys[i] + '/min'] = true;
                            }
                            relids = getDiffChildrenRelids(diffMeta.pointers[keys[i]]);
                            for (j = 0; j < relids.length; j++) {
                                tPath = getCommonPathForConcat(relids[j]);
                                conflict[path + '/pointers/' + keys[i] + '/' + tPath + '//'] =
                                    conflict[path + '/pointers/' + keys[i] + '/' + tPath + '//'] || {
                                        value: diffMeta.pointers[keys[i]][relids[j]],
                                        conflictingPaths: {}
                                    };
                                conflict[path + '/pointers/' + keys[i] + '/' + tPath + '//']
                                    .conflictingPaths[opposingPath] = true;
                                opposingConflict.conflictingPaths[path + '/pointers/' +
                                keys[i] + '/' + tPath + '//'] = true;
                            }
                        }
                    }
                }
            }
            //aspects
            //TODO
        }

        function gatherFullSetConflicts(diffSet, mine, path, opposingPath) {
            var relids = getDiffChildrenRelids(diffSet),
                i, keys, j, conflict, opposingConflict;

            //setting the conflicts
            if (mine === true) {
                conflict = _conflictMine;
                opposingConflict = _conflictTheirs[opposingPath];
            } else {
                conflict = _conflictTheirs;
                opposingConflict = _conflictMine[opposingPath];
            }

            //set attributes and registry entries
            keys = Object.keys(diffSet.attr || {});
            for (j = 0; j < keys.length; j++) {
                conflict[path + '/attr/' + keys[j]] =
                    conflict[path + '/attr/' + keys[j]] || {
                        value: diffSet.attr[keys[j]],
                        conflictingPaths: {}
                    };
                conflict[path + '/attr/' + keys[j]].conflictingPaths[opposingPath] = true;
                opposingConflict.conflictingPaths[path + '/attr/' + keys[j]] = true;
            }
            keys = Object.keys(diffSet.reg || {});
            for (j = 0; j < keys.length; j++) {
                conflict[path + '/reg/' + keys[j]] =
                    conflict[path + '/reg/' + keys[j]] || {
                        value: diffSet.reg[keys[j]],
                        conflictingPaths: {}
                    };
                conflict[path + '/reg/' + keys[j]].conflictingPaths[opposingPath] = true;
                opposingConflict.conflictingPaths[path + '/reg/' + keys[j]] = true;
            }

            for (i = 0; i < relids.length; i++) {
                if (diffSet[relids[i]] === CONSTANTS.TO_DELETE_STRING) {
                    //single conflict as the element was removed
                    conflict[path + '/' + relids[i] + '/'] = conflict[path + '/' + relids[i] + '/'] || {
                            value: CONSTANTS.TO_DELETE_STRING,
                            conflictingPaths: {}
                        };
                    conflict[path + '/' + relids[i] + '/'].conflictingPaths[opposingPath] = true;
                    opposingConflict.conflictingPaths[path + '/' + relids[i] + '/'] = true;
                } else {
                    keys = Object.keys(diffSet[relids[i]].attr || {});
                    for (j = 0; j < keys.length; j++) {
                        conflict[path + '/' + relids[i] + '//attr/' + keys[j]] =
                            conflict[path + '/' + relids[i] + '//attr/' + keys[j]] || {
                                value: diffSet[relids[i]].attr[keys[j]],
                                conflictingPaths: {}
                            };
                        conflict[path + '/' + relids[i] + '//attr/' + keys[j]].conflictingPaths[opposingPath] = true;
                        opposingConflict.conflictingPaths[path + '/' + relids[i] + '//attr/' + keys[j]] = true;
                    }
                    keys = Object.keys(diffSet[relids[i]].reg || {});
                    for (j = 0; j < keys.length; j++) {
                        conflict[path + '/' + relids[i] + '//reg/' + keys[j]] =
                            conflict[path + '/' + relids[i] + '//reg/' + keys[j]] || {
                                value: diffSet[relids[i]].reg[keys[j]],
                                conflictingPaths: {}
                            };
                        conflict[path + '/' + relids[i] + '//reg/' + keys[j]].conflictingPaths[opposingPath] = true;
                        opposingConflict.conflictingPaths[path + '/' + relids[i] + '//reg/' + keys[j]] = true;
                    }
                }
            }
        }

        function gatherFullNodeConflicts(diffNode, mine, path, opposingPath) {
            var conflict,
                opposingConflict,
                keys, i,
                createSingleKeyValuePairConflicts = function (pathBase, data) {
                    var keys, i;
                    keys = Object.keys(data);
                    for (i = 0; i < keys.length; i++) {
                        conflict[pathBase + '/' + keys[i]] = conflict[pathBase + '/' + keys[i]] || {
                                value: data[keys[i]],
                                conflictingPaths: {}
                            };
                        conflict[pathBase + '/' + keys[i]].conflictingPaths[opposingPath] = true;
                        opposingConflict.conflictingPaths[pathBase + '/' + keys[i]] = true;
                    }
                };

            //setting the conflicts
            if (mine === true) {
                conflict = _conflictMine;
                opposingConflict = _conflictTheirs[opposingPath];
            } else {
                conflict = _conflictTheirs;
                opposingConflict = _conflictMine[opposingPath];
            }
            ASSERT(opposingConflict);
            //if the node was moved we should make a conflict for the whole node as well
            if (diffNode.movedFrom) {
                conflict[path] = conflict[path] || {value: path, conflictingPaths: {}};
                conflict[path].conflictingPaths[opposingPath] = true;
                opposingConflict.conflictingPaths[path] = true;
            }
            createSingleKeyValuePairConflicts(path + '/attr', diffNode.attr || {});
            createSingleKeyValuePairConflicts(path + '/reg', diffNode.reg || {});
            createSingleKeyValuePairConflicts(path + '/pointer', diffNode.pointer || {});

            if (diffNode.set) {
                if (diffNode.set === CONSTANTS.TO_DELETE_STRING) {
                    conflict[path + '/set'] = conflict[path + '/set'] || {
                            value: CONSTANTS.TO_DELETE_STRING,
                            conflictingPaths: {}
                        };
                    conflict[path + '/set'].conflictingPaths[opposingPath] = true;
                    opposingConflict.conflictingPaths[path + '/set'] = true;
                } else {
                    keys = Object.keys(diffNode.set);
                    for (i = 0; i < keys.length; i++) {
                        if (diffNode.set[keys[i]] === CONSTANTS.TO_DELETE_STRING) {
                            conflict[path + '/set/' + keys[i]] = conflict[path + '/set/' + keys[i]] || {
                                    value: CONSTANTS.TO_DELETE_STRING,
                                    conflictingPaths: {}
                                };
                            conflict[path + '/set/' + keys[i]].conflictingPaths[opposingPath] = true;
                            opposingConflict.conflictingPaths[path + '/set/' + keys[i]] = true;
                        } else {
                            gatherFullSetConflicts(diffNode.set[keys[i]], mine, path + '/set/' + keys[i], opposingPath);
                        }
                    }
                }
            }

            if (diffNode.meta) {
                gatherFullMetaConflicts(diffNode.meta, mine, path + '/meta', opposingPath);
            }

            //if the opposing item is theirs, we have to recursively go down in our changes
            if (mine) {
                keys = getDiffChildrenRelids(diffNode);
                for (i = 0; i < keys.length; i++) {
                    gatherFullNodeConflicts(diffNode[keys[i]], true, path + '/' + keys[i], opposingPath);
                }
            }

        }

        function concatSingleKeyValuePairs(path, base, extension) {
            var keys, i, temp;
            keys = Object.keys(extension);
            for (i = 0; i < keys.length; i++) {
                temp = extension[keys[i]];
                if (typeof temp === 'string' && temp !== CONSTANTS.TO_DELETE_STRING) {
                    temp = getCommonPathForConcat(temp);
                }
                if (base[keys[i]] !== undefined && CANON.stringify(base[keys[i]]) !== CANON.stringify(temp)) {
                    //conflict
                    _conflictMine[path + '/' + keys[i]] = {value: base[keys[i]], conflictingPaths: {}};
                    _conflictTheirs[path + '/' + keys[i]] = {value: extension[keys[i]], conflictingPaths: {}};
                    _conflictMine[path + '/' + keys[i]].conflictingPaths[path + '/' + keys[i]] = true;
                    _conflictTheirs[path + '/' + keys[i]].conflictingPaths[path + '/' + keys[i]] = true;
                } else {
                    base[keys[i]] = extension[keys[i]];
                }
            }
        }

        function concatSet(path, base, extension) {
            var names = Object.keys(extension),
                members, i, j, memberPath;

            for (i = 0; i < names.length; i++) {
                if (base[names[i]]) {
                    if (base[names[i]] === CONSTANTS.TO_DELETE_STRING) {
                        if (extension[names[i]] !== CONSTANTS.TO_DELETE_STRING) {
                            //whole set conflict
                            _conflictMine[path + '/' + names[i]] = {
                                value: CONSTANTS.TO_DELETE_STRING,
                                conflictingPaths: {}
                            };
                            gatherFullSetConflicts(extension[names[i]],
                                false, path + '/' + names[i], path + '/' + names[i]);
                        }
                    } else {
                        if (extension[names[i]] === CONSTANTS.TO_DELETE_STRING) {
                            //whole set conflict
                            _conflictTheirs[path + '/' + names[i]] = {
                                value: CONSTANTS.TO_DELETE_STRING,
                                conflictingPaths: {}
                            };
                            gatherFullSetConflicts(base[names[i]], true, path + '/' + names[i], path + '/' + names[i]);
                        } else {
                            //now check the set attribute and registry differences
                            if (base[names[i]].attr && extension[names[i]].attr) {
                                concatSingleKeyValuePairs(path + '/' +
                                    names[i] + '/attr',
                                    base[names[i]].attr,
                                    extension[names[i]].attr);
                            }
                            if (base[names[i]].reg && extension[names[i]].reg) {
                                concatSingleKeyValuePairs(path + '/' +
                                    names[i] + '/reg',
                                    base[names[i]].reg,
                                    extension[names[i]].reg);
                            }
                            //now we can only have member or sub-member conflicts...
                            members = getDiffChildrenRelids(extension[names[i]]);
                            for (j = 0; j < members.length; j++) {
                                memberPath = getCommonPathForConcat(members[j]);
                                if (base[names[i]][memberPath]) {
                                    if (base[names[i]][memberPath] === CONSTANTS.TO_DELETE_STRING) {
                                        if (extension[names[i]][members[j]] !== CONSTANTS.TO_DELETE_STRING) {
                                            //whole member conflict
                                            _conflictMine[path + '/' + names[i] + '/' + memberPath + '//'] = {
                                                value: CONSTANTS.TO_DELETE_STRING,
                                                conflictingPaths: {}
                                            };
                                            gatherFullNodeConflicts(extension[names[i]][members[j]],
                                                false,
                                                path + '/' + names[i] + '/' + memberPath + '//', path +
                                                '/' + names[i] + '/' + memberPath + '//');
                                        }
                                    } else {
                                        if (extension[names[i]][members[j]] === CONSTANTS.TO_DELETE_STRING) {
                                            //whole member conflict
                                            _conflictTheirs[path + '/' + names[i] + '/' + memberPath + '//'] = {
                                                value: CONSTANTS.TO_DELETE_STRING,
                                                conflictingPaths: {}
                                            };
                                            gatherFullNodeConflicts(base[names[i]][memberPath],
                                                true,
                                                path + '/' + names[i] + '/' + memberPath + '//', path +
                                                '/' + names[i] + '/' + memberPath + '//');
                                        } else {
                                            if (extension[names[i]][members[j]].attr) {
                                                if (base[names[i]][memberPath].attr) {
                                                    concatSingleKeyValuePairs(path + '/' +
                                                        names[i] + '/' + memberPath + '/' + '/attr',
                                                        base[names[i]][memberPath].attr,
                                                        extension[names[i]][members[j]].attr);
                                                } else {
                                                    base[names[i]][memberPath].attr =
                                                        extension[names[i]][members[j]].attr;
                                                }
                                            }
                                            if (extension[names[i]][members[j]].reg) {
                                                if (base[names[i]][memberPath].reg) {
                                                    concatSingleKeyValuePairs(path + '/' +
                                                        names[i] + '/' + memberPath + '/' + '/reg',
                                                        base[names[i]][memberPath].reg,
                                                        extension[names[i]][members[j]].reg);
                                                } else {
                                                    base[names[i]][memberPath].reg =
                                                        extension[names[i]][members[j]].reg;
                                                }
                                            }

                                        }
                                    }
                                } else {
                                    //concat
                                    base[names[i]][memberPath] = extension[names[i]][members[j]];
                                }
                            }
                        }
                    }
                } else {
                    //simple concatenation
                    //TODO the path for members should be replaced here as well...
                    base[names[i]] = extension[names[i]];
                }
            }
        }

        function concatMeta(path, base, extension) {
            var keys, i, tPath, j, paths, t2Path,
                mergeMetaItems = function (bPath, bData, eData) {
                    var bKeys, tKeys, i, tPath, t2Path;
                    //delete checks
                    if (bData === CONSTANTS.TO_DELETE_STRING || eData === CONSTANTS.TO_DELETE_STRING) {
                        if (CANON.stringify(bData) !== CANON.stringify(eData)) {
                            _conflictMine[bPath] = _conflictMine[bPath] || {value: bData, conflictingPaths: {}};
                            _conflictMine[bPath].conflictingPaths[bPath] = true;
                            _conflictTheirs[bPath] = _conflictTheirs[bPath] || {value: eData, conflictingPaths: {}};
                            _conflictTheirs[bPath].conflictingPaths[bPath] = true;
                        }
                    } else {
                        //max
                        if (eData.max) {
                            if (bData.max && bData.max !== eData.max) {
                                tPath = bPath + '/max';
                                _conflictMine[tPath] = _conflictMine[tPath] || {
                                        value: bData.max,
                                        conflictingPaths: {}
                                    };
                                _conflictMine[tPath].conflictingPaths[tPath] = true;
                                _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                        value: eData.max,
                                        conflictingPaths: {}
                                    };
                                _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                            } else {
                                bData.max = eData.max;
                            }
                        }
                        //min
                        if (eData.min) {
                            if (bData.min && bData.min !== eData.min) {
                                tPath = bPath + '/min';
                                _conflictMine[tPath] = _conflictMine[tPath] || {
                                        value: bData.min,
                                        conflictingPaths: {}
                                    };
                                _conflictMine[tPath].conflictingPaths[tPath] = true;
                                _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                        value: eData.min,
                                        conflictingPaths: {}
                                    };
                                _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                            } else {
                                bData.min = eData.min;
                            }
                        }
                        //targets
                        bKeys = getDiffChildrenRelids(bData);
                        tKeys = getDiffChildrenRelids(eData);
                        for (i = 0; i < tKeys.length; i++) {
                            tPath = getCommonPathForConcat(tKeys[i]);
                            if (bKeys.indexOf(tPath) !== -1 && CANON.stringify(bData[tPath]) !==
                                CANON.stringify(eData[tKeys[i]])) {

                                t2Path = tPath;
                                tPath = bPath + '/' + tPath + '//';
                                _conflictMine[tPath] = _conflictMine[tPath] || {
                                        value: bData[t2Path],
                                        conflictingPaths: {}
                                    };
                                _conflictMine[tPath].conflictingPaths[tPath] = true;
                                _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                        value: eData[tKeys[i]],
                                        conflictingPaths: {}
                                    };
                                _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                            } else {
                                bData[tPath] = eData[tKeys[i]];
                            }
                        }
                    }
                };
            if (CANON.stringify(base) !== CANON.stringify(extension)) {
                if (base === CONSTANTS.TO_DELETE_STRING) {
                    _conflictMine[path] = _conflictMine[path] || {
                            value: CONSTANTS.TO_DELETE_STRING,
                            conflictingPaths: {}
                        };
                    gatherFullMetaConflicts(extension, false, path, path);
                } else {
                    if (extension === CONSTANTS.TO_DELETE_STRING) {
                        _conflictTheirs[path] = _conflictTheirs[path] || {
                                value: CONSTANTS.TO_DELETE_STRING,
                                conflictingPaths: {}
                            };
                        gatherFullMetaConflicts(base, true, path, path);
                    } else {
                        //now check for sub-meta conflicts

                        //children
                        if (extension.children) {
                            if (base.children) {
                                mergeMetaItems(path + '/children', base.children, extension.children);
                            } else {
                                //we just simply merge the extension's
                                base.children = extension.children;
                            }
                        }
                        //pointers
                        if (extension.pointers) {
                            if (base.pointers) {
                                //complete deletion
                                if (base.pointers === CONSTANTS.TO_DELETE_STRING ||
                                    extension.pointers === CONSTANTS.TO_DELETE_STRING) {
                                    if (CANON.stringify(base.pointers) !== CANON.stringify(extension.pointers)) {
                                        tPath = path + '/pointers';
                                        _conflictMine[tPath] = _conflictMine[tPath] || {
                                                value: base.pointers,
                                                conflictingPaths: {}
                                            };
                                        _conflictMine[tPath].conflictingPaths[tPath] = true;
                                        _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                                value: extension.pointers,
                                                conflictingPaths: {}
                                            };
                                        _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                                    }
                                } else {
                                    keys = Object.keys(extension.pointers);
                                    for (i = 0; i < keys.length; i++) {
                                        if (base.pointers[keys[i]]) {
                                            mergeMetaItems(path + '/pointers/' + keys[i], base.pointers[keys[i]],
                                                extension.pointers[keys[i]]);
                                        } else {
                                            base.pointers[keys[i]] = extension.pointers[keys[i]];
                                        }
                                    }
                                }
                            } else {
                                base.pointers = extension.pointers;
                            }
                        }
                        //attributes
                        if (extension.attributes) {
                            if (base.attributes) {
                                if (extension.attributes === CONSTANTS.TO_DELETE_STRING ||
                                    base.attributes === CONSTANTS.TO_DELETE_STRING) {
                                    if (CANON.stringify(base.attributes) !== CANON.stringify(extension.attributes)) {
                                        tPath = path + '/attributes';
                                        _conflictMine[tPath] = _conflictMine[tPath] || {
                                                value: base.attributes,
                                                conflictingPaths: {}
                                            };
                                        _conflictMine[tPath].conflictingPaths[tPath] = true;
                                        _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                                value: extension.attributes,
                                                conflictingPaths: {}
                                            };
                                        _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                                    }
                                } else {
                                    keys = Object.keys(extension.attributes);
                                    for (i = 0; i < keys.length; i++) {
                                        if (base.attributes[keys[i]]) {
                                            if (extension.attributes[keys[i]] === CONSTANTS.TO_DELETE_STRING ||
                                                base.attributes[keys[i]] === CONSTANTS.TO_DELETE_STRING) {

                                                if (CANON.stringify(base.attributes[keys[i]]) !==
                                                    CANON.stringify(extension.attributes[keys[i]])) {

                                                    tPath = path + '/attributes/' + [keys[i]];
                                                    _conflictMine[tPath] = _conflictMine[tPath] || {
                                                            value: base.attributes[keys[i]],
                                                            conflictingPaths: {}
                                                        };
                                                    _conflictMine[tPath].conflictingPaths[tPath] = true;
                                                    _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                                            value: extension.attributes[keys[i]],
                                                            conflictingPaths: {}
                                                        };
                                                    _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                                                }
                                            } else {
                                                concatSingleKeyValuePairs(path + '/attributes/' + keys[i],
                                                    base.attributes[keys[i]], extension.attributes[keys[i]]);
                                            }
                                        } else {
                                            base.attributes[keys[i]] = extension.attributes[keys[i]];
                                        }
                                    }

                                }
                            } else {
                                base.attributes = extension.attributes;
                            }
                        }

                        //aspects
                        if (extension.aspects) {
                            if (base.aspects) {
                                if (extension.aspects === CONSTANTS.TO_DELETE_STRING ||
                                    base.aspects === CONSTANTS.TO_DELETE_STRING) {
                                    if (CANON.stringify(base.aspects) !== CANON.stringify(extension.aspects)) {
                                        tPath = path + '/aspects';
                                        _conflictMine[tPath] = _conflictMine[tPath] || {
                                                value: base.aspects,
                                                conflictingPaths: {}
                                            };
                                        _conflictMine[tPath].conflictingPaths[tPath] = true;
                                        _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                                value: extension.aspects,
                                                conflictingPaths: {}
                                            };
                                        _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                                    }
                                } else {
                                    keys = Object.keys(extension.aspects);
                                    for (i = 0; i < keys.length; i++) {
                                        if (base.aspects[keys[i]]) {
                                            if (extension.aspects[keys[i]] === CONSTANTS.TO_DELETE_STRING ||
                                                base.aspects[keys[i]] === CONSTANTS.TO_DELETE_STRING) {
                                                if (CANON.stringify(base.aspects[keys[i]]) !==
                                                    CANON.stringify(extension.aspects[keys[i]])) {
                                                    tPath = path + '/aspects/' + keys[i];
                                                    _conflictMine[tPath] = _conflictMine[tPath] || {
                                                            value: base.aspects[keys[i]],
                                                            conflictingPaths: {}
                                                        };
                                                    _conflictMine[tPath].conflictingPaths[tPath] = true;
                                                    _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                                            value: extension.aspects[keys[i]],
                                                            conflictingPaths: {}
                                                        };
                                                    _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                                                }
                                            } else {
                                                paths = Object.keys(extension.aspects[keys[i]]);
                                                for (j = 0; j < paths.length; j++) {
                                                    tPath = getCommonPathForConcat(paths[j]);
                                                    if (base.aspects[keys[i]][tPath]) {
                                                        if (CANON.stringify(base.aspects[keys[i]][tPath]) !==
                                                            CANON.stringify(extension.aspects[keys[i]][paths[j]])) {
                                                            t2Path = tPath;
                                                            tPath = path + '/aspects/' + keys[i] + '/' + tPath + '//';
                                                            _conflictMine[tPath] = _conflictMine[tPath] || {
                                                                    value: base.aspects[keys[i]][t2Path],
                                                                    conflictingPaths: {}
                                                                };
                                                            _conflictMine[tPath].conflictingPaths[tPath] = true;
                                                            _conflictTheirs[tPath] = _conflictTheirs[tPath] || {
                                                                    value: extension.aspects[keys[i]][paths[j]],
                                                                    conflictingPaths: {}
                                                                };
                                                            _conflictTheirs[tPath].conflictingPaths[tPath] = true;
                                                        }
                                                    } else {
                                                        base.aspects[keys[i]][tPath] =
                                                            extension.aspects[keys[i]][paths[j]];
                                                    }
                                                }
                                            }
                                        } else {
                                            base.aspects[keys[i]] = extension.aspects[keys[i]];
                                        }
                                    }
                                }
                            } else {
                                base.aspects = extension.aspects;
                            }
                        }
                    }
                }
            }
        }

        function tryToConcatNodeChange(extNode, path) {
            var guid = extNode.guid,
                oGuids = getObstructiveGuids(extNode),
                baseNode = getNodeByGuid(_concatBase, guid),
                basePath = getPathOfGuid(_concatBase, guid),
                realBaseNode = baseNode,
                i, tPath,
                relids = getDiffChildrenRelids(extNode);

            if (extNode.removed === true) {
                if (baseNode !== null && baseNode.removed !== true && hasRealChange(baseNode)) {
                    // we cannot simply merge the removal data-wise
                } else {
                    //we simply concat the deletion
                    insertAtPath(_concatBase, path, extNode);
                }
                //we still need to check if some instance go changed in the other branch
                oGuids = getWhomIObstructGuids(guid);
                ASSERT(oGuids.length > 0);
                for (i = 0; i < oGuids.length; i++) {
                    baseNode = getNodeByGuid(_concatBase, oGuids[i]);
                    if (baseNode !== null && baseNode.removed !== true && hasRealChange(baseNode)) {
                        tPath = path + '/removed';
                        _conflictTheirs[tPath] = _conflictTheirs[tPath] || {value: true, conflictingPaths: {}};
                        basePath = getPathOfGuid(_concatBase, oGuids[i]);
                        gatherFullNodeConflicts(baseNode, true, basePath, tPath);
                    }
                }
            } else {
                if (oGuids.length > 0) {
                    for (i = 0; i < oGuids.length; i++) {
                        baseNode = getNodeByGuid(_concatBase, oGuids[i]);
                        basePath = getPathOfGuid(_concatBase, oGuids[i]);
                        if (hasRealChange(extNode)) {
                            _conflictMine[basePath + '/removed'] = _conflictMine[basePath + '/removed'] || {
                                    value: true,
                                    conflictingPaths: {}
                                };
                            gatherFullNodeConflicts(extNode, false, path, basePath + '/removed');
                        } else {
                            _conflictTheirs[basePath + '/removed'] = _conflictTheirs[basePath + '/removed'] || {
                                    value: true,
                                    conflictingPaths: {}
                                };
                            gatherFullNodeConflicts(realBaseNode, true, path, basePath + '/removed');
                        }
                    }
                } else if (baseNode) {
                    //here we are able to check the sub-node conflicts
                    //check double moves - we do not care if they moved under the same parent
                    if (extNode.movedFrom) {
                        if (baseNode.movedFrom && path !== basePath) {
                            _conflictMine[basePath] = _conflictMine[basePath] || {
                                    value: 'move',
                                    conflictingPaths: {}
                                };
                            _conflictTheirs[path] = _conflictTheirs[path] || {value: 'move', conflictingPaths: {}};
                            _conflictMine[basePath].conflictingPaths[path] = true;
                            _conflictTheirs[path].conflictingPaths[basePath] = true;
                            //we keep the node where it is, but synchronize the paths
                            path = basePath;
                        } else if (path !== basePath) {
                            //first we move the base object to its new path
                            //we copy the moved from information right here
                            baseNode.movedFrom = extNode.movedFrom;
                            insertAtPath(_concatBase, path, baseNode);
                            removePathFromDiff(_concatBase, basePath);
                            baseNode = getNodeByGuid(_concatBase, guid);
                            basePath = getPathOfGuid(_concatBase, guid);
                            ASSERT(path === basePath);
                        }
                    }

                    ASSERT(basePath === path || baseNode.movedFrom === path);
                    path = basePath; //the base was moved

                    //and now the sub-node conflicts
                    if (extNode.attr) {
                        if (baseNode.attr) {
                            concatSingleKeyValuePairs(path + '/attr', baseNode.attr, extNode.attr);
                        } else {
                            insertAtPath(_concatBase, path + '/attr', extNode.attr);
                        }
                    }
                    if (extNode.reg) {
                        if (baseNode.reg) {
                            concatSingleKeyValuePairs(path + '/reg', baseNode.reg, extNode.reg);
                        } else {
                            insertAtPath(_concatBase, path + '/reg', extNode.reg);
                        }
                    }
                    if (extNode.pointer) {
                        if (baseNode.pointer) {
                            concatSingleKeyValuePairs(path + '/pointer', baseNode.pointer, extNode.pointer);
                        } else {
                            insertAtPath(_concatBase, path + '/pointer', extNode.pointer);
                        }
                    }
                    if (extNode.set) {
                        if (baseNode.set) {
                            concatSet(path + '/set', baseNode.set, extNode.set);
                        } else {
                            insertAtPath(_concatBase, path + '/set', extNode.set);
                        }
                    }
                    if (extNode.meta) {
                        if (baseNode.meta) {
                            concatMeta(path + '/meta', baseNode.meta, extNode.meta);
                        } else {
                            insertAtPath(_concatBase, path + '/meta', extNode.meta);
                        }
                    }
                } else if (typeof path === 'string' && path.length > 0) {
                    //there is no basenode so we can concat the whole node
                    insertAtPath(_concatBase, path, getSingleNode(extNode));
                }
            }

            //here comes the recursion
            for (i = 0; i < relids.length; i++) {
                tryToConcatNodeChange(extNode[relids[i]], path + CONSTANTS.PATH_SEP + relids[i]);
            }

        }

        function generateConflictItems(mine, theirs) {
            var items = [], item,
                keys, i, j, conflicts, diffNode;
            keys = Object.keys(_conflictMine);

            for (i = 0; i < keys.length; i++) {
                conflicts = Object.keys(_conflictMine[keys[i]].conflictingPaths || {});
                ASSERT(conflicts.length > 0);
                for (j = 0; j < conflicts.length; j++) {
                    item = {
                        selected: 'mine',
                        mine: {
                            path: keys[i],
                            info: keys[i].replace(/\//g, ' / '),
                            value: _conflictMine[keys[i]].value,
                            nodePath: DIFF.pathToObject(keys[i]).node
                        },
                        theirs: {
                            path: conflicts[j],
                            info: conflicts[j].replace(/\//g, ' / '),
                            value: _conflictTheirs[conflicts[j]].value,
                            nodePath: DIFF.pathToObject(conflicts[j]).node
                        }
                    };
                    diffNode = getPathOfDiff(mine, item.mine.nodePath);
                    if (typeof diffNode.collidingRelid === 'string') {
                        item.mine.originalNodePath = getParentPath(item.mine.nodePath) +
                            CONSTANTS.PATH_SEP + diffNode.collidingRelid;
                    }

                    diffNode = getPathOfDiff(theirs, item.theirs.nodePath);
                    if (typeof diffNode.collidingRelid === 'string') {
                        item.theirs.originalNodePath = getParentPath(item.theirs.nodePath) +
                            CONSTANTS.PATH_SEP + diffNode.collidingRelid;
                    }
                    items.push(item);

                }
            }
            return items;
        }

        function harmonizeConflictPaths(diff) {
            var relids = getDiffChildrenRelids(diff),
                keys, i, members, j;

            keys = Object.keys(diff.pointer || {});
            for (i = 0; i < keys.length; i++) {
                diff.pointer[keys[i]] = getCommonPathForConcat(diff.pointer[keys[i]]);
            }
            keys = Object.keys(diff.set || {});
            for (i = 0; i < keys.length; i++) {
                members = Object.keys(diff.set[keys[i]] || {});
                for (j = 0; j < members.length; j++) {
                    if (members[j] !== getCommonPathForConcat(members[j])) {
                        diff.set[keys[i]][getCommonPathForConcat(members[j])] = diff.set[keys[i]][members[j]];
                        delete diff.set[keys[i]][members[j]];
                    }
                }
            }

            //TODO we have to do the meta as well
            for (i = 0; i < relids.length; i++) {
                harmonizeConflictPaths(diff[relids[i]]);
            }
        }

        function depthOfPath(path) {
            ASSERT(typeof path === 'string');
            return path.split('/').length;
        }

        function resolveMoves(resolveObject) {
            var i, moves = {},
                filteredItems = [],
                path,
                moveBaseOfPath = function (path) {
                    var keys = Object.keys(moves),
                        i, maxDepth = -1,
                        base = null;
                    for (i = 0; i < keys.length; i++) {
                        if (path.indexOf(keys[i]) === 1 && depthOfPath(keys[i]) > maxDepth) {
                            base = keys[i];
                            maxDepth = depthOfPath(keys[i]);
                        }
                    }
                    return base;
                };
            for (i = 0; i < resolveObject.items.length; i++) {
                if (resolveObject.items[i].selected === 'theirs' && resolveObject.items[i].theirs.value === 'move') {
                    moves[resolveObject.items[i].mine.path] = resolveObject.items[i].theirs.path;
                    //and we also make the move
                    insertAtPath(resolveObject.merge,
                        resolveObject.items[i].theirs.path,
                        getPathOfDiff(resolveObject.merge, resolveObject.items[i].mine.path));
                    removePathFromDiff(resolveObject.merge, resolveObject.items[i].mine.path);
                } else {
                    filteredItems.push(resolveObject.items[i]);
                }
            }
            resolveObject.items = filteredItems;

            //in a second run we modify all sub-path of the moves paths
            for (i = 0; i < resolveObject.items.length; i++) {
                if (resolveObject.items[i].selected === 'theirs') {
                    path = moveBaseOfPath(resolveObject.items[i].theirs.path);
                    if (path) {
                        resolveObject.items[i].theirs.path =
                            resolveObject.items[i].theirs.path.replace(path, moves[path]);
                    }
                    path = moveBaseOfPath(resolveObject.items[i].mine.path);
                    if (path) {
                        resolveObject.items[i].mine.path = resolveObject.items[i].mine.path.replace(path, moves[path]);
                    }
                }
            }
        }

        //</editor-fold>

        //<editor-fold=Added Methods>

        // FIXME: It really looks like the diff requires that no nodes are mutated. This must be documented somewhere.
        // FIXME: Maybe checking for isMutated in core.js at the roots are enough..
        this.nodeDiff = function (source, target) {
            var diff = {
                children: childrenDiff(source, target),
                attr: attrDiff(source, target),
                reg: regDiff(source, target),
                pointer: pointerDiff(source, target),
                set: setDiff(source, target),
                meta: metaDiff(source, target)
            };

            normalize(diff);

            return isEmptyNodeDiff(diff) ? null : diff;
        };

        this.generateTreeDiff = function (sRoot, tRoot) {
            var yetToCompute = {},
                diffMoves = {};

            return TASYNC.call(function (diff) {

                return checkRound(yetToCompute, diff, diffMoves, true);
            }, updateDiff(sRoot, tRoot, yetToCompute));
        };

        this.generateLightTreeDiff = function (sRoot, tRoot) {
            var yetToCompute = {};
            return updateDiff(sRoot, tRoot, yetToCompute);
        };

        this.applyTreeDiff = function (root, diff) {
            // return TASYNC.join(makeInitialContainmentChanges(root, diff), applyNodeChange(root, '', diff));
            // return makeInitialContainmentChanges(root,diff);
            var done = makeInitialContainmentChanges(root, diff);

            done = TASYNC.call(setBaseRelationsOfNewNodes, root, '', diff, done);

            return TASYNC.call(function () {
                return applyNodeChange(root, '', diff);
            }, done);
            // done = TASYNC.call(applyNodeChange, root, '', diff, done);

            // return done;
        };

        /**
         *
         * @param {object} base - diff1
         * @param {object} extension - diff2
         *
         * @returns {object}
         */
        this.tryToConcatChanges = function (base, extension) {
            var result = {};
            _conflictItems = [];
            _conflictMine = {};
            _conflictTheirs = {};
            _concatBase = JSON.parse(JSON.stringify(base));
            _concatExtension = JSON.parse(JSON.stringify(extension));
            _concatBaseRemovals = {};
            _concatMoves = {
                getBaseSourceFromDestination: {},
                getBaseDestinationFromSource: {},
                getExtensionSourceFromDestination: {},
                getExtensionDestinationFromSource: {}
            };

            fixInheritanceCollision('', _concatBase, _concatExtension, true);
            fixInheritanceCollision('', _concatExtension, _concatBase, false);

            completeConcatBase(_concatBase, _concatExtension);
            getMoveSources(_concatBase,
                '', _concatMoves.getBaseSourceFromDestination, _concatMoves.getBaseDestinationFromSource);
            getMoveSources(_concatExtension,
                '', _concatMoves.getExtensionSourceFromDestination, _concatMoves.getExtensionDestinationFromSource);
            getConcatBaseRemovals(_concatBase);
            getConcatBaseRemovals(_concatExtension);

            fixCollision('', null, _concatBase, _concatExtension);
            tryToConcatNodeChange(_concatExtension, '');

            result.items = generateConflictItems(_concatBase, _concatExtension);
            result.mine = _conflictMine;
            result.theirs = _conflictTheirs;
            result.merge = _concatBase;
            harmonizeConflictPaths(result.merge);

            return result;
        };

        this.applyResolution = function (conflictObject) {
            //we apply conflict items to the merge and return it as a diff
            var i;
            resolveMoves(conflictObject);
            for (i = 0; i < conflictObject.items.length; i++) {
                if (conflictObject.items[i].selected !== 'mine') {
                    removePathFromDiff(conflictObject.merge, conflictObject.items[i].mine.path);
                    if (conflictObject.items[i].selected === 'theirs') {
                        insertAtPath(conflictObject.merge,
                            conflictObject.items[i].theirs.path, conflictObject.items[i].theirs.value);
                    } else {
                        insertAtPath(conflictObject.merge,
                            conflictObject.items[i].other.path, conflictObject.items[i].other.value);
                    }

                }
            }

            return conflictObject.merge;
        };
        //</editor-fold>
    }

    return DiffCore;
});
