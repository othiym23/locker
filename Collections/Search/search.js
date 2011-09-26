/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var fs = require('fs'),
    locker = require(__dirname + '/../../Common/node/locker.js');

var lsearch = require(__dirname + '/../../Common/node/lsearch');
var lutil = require(__dirname + '/../../Common/node/lutil');
var lconfig = require(__dirname + '/../../Common/node/lconfig');
var path = require('path');
var events = locker.events;
var lmongo = require(__dirname + "/../../Common/node/lmongo");
var lockerInfo = {lockerUrl: lconfig.lockerBase};
exports.lockerInfo = lockerInfo;

var express = require('express');
var request = require('request');
var async = require('async');

module.exports = function(app, svcInfo) {

    var prefix = path.join("/Me/", svcInfo.id);

    app.get(prefix + '/', function(req, res) {
        res.send("You should use a search interface instead of trying to talk to me directly.");
    });

    for (var i = 0; i < svcInfo.events.length; i++) {
        events.on(svcInfo.events[i], function(eventObj) {
            handleEvent(eventObj);
        });
    }

    app.post(prefix + '/index', function(req, res) {
        exports.handlePostIndex(req, function(err, response) {
           if (err) {
               return res.send(err, 500);
           }
           return res.send(response);
       });
    });

    app.get(prefix + '/query', function(req, res) {
        exports.handleGetQuery(req, function(err, response) {
           if (err) {
               return res.send(err, 500);
           }
           return res.send(response);
       });
    });

    app.get(prefix + '/update', function(req, res) {
        exports.handleGetUpdate(function(err, response) {
           if (err) {
               return res.send(err, 500);
           }
           return res.send('Full search reindex started');
       });
    });

    app.get(prefix + '/reindexForType', function(req, res) {
        exports.handleGetReindexForType(req.param('type'), function(err, response) {
           if (err) {
               return res.send(err, 500);
           }
           return res.send(response);
        });
    });

    lsearch.setEngine(lsearch.engines.CLucene);
    lsearch.setIndexPath(path.join(lconfig.lockerDir, lconfig.me, svcInfo.id, "search.index"));
}

exports.handleGetUpdate = function(callback) {
    var error;
    lsearch.resetIndex(function(err) {
        if (err) {
            error = 'Failed attempting to reset search index for /search/update GET request: ' + err;
            console.error(error);
            return callback(err);
        }

        reindexType(lockerInfo.lockerUrl + '/Me/contacts/allContacts', 'contact/full', 'contacts', function(err) {});
        reindexType(lockerInfo.lockerUrl + '/Me/photos/allPhotos', 'photo/full', 'photos', function(err) {});
        locker.providers('status/twitter', function(err, services) {
            if (!services) return;
            services.forEach(function(svc) {
               if (svc.provides.indexOf('status/twitter') >= 0) {
                   reindexType(lockerInfo.lockerUrl + '/Me/' + svc.id + '/getCurrent/timeline', 'timeline/twitter', 'twitter/timeline', function(err) {});
                }
            });
        });

        return callback(err);
    });
};

handleEvent = function(event) {
    if (event.hasOwnProperty('type')) {
        // FIXME Hack to handle inconsistencies between photo and contacts collection
        if (event.type === 'photo') {
            event.type = 'photo/full';
            event.obj.data = event.obj;
        }
        // END FIXME

        var source = getSourceForEvent(event);

        if (event.action === 'new' || event.action === 'update') {
            lsearch.indexTypeAndSource(event.type, source, event.obj.data, function(err, time) {
                if (err) {
                    handleError(event.type, event.action, event.obj.data._id, err);
                    return;
                }
                handleLog(event.type, event.action, event.obj.data._id, time);
                return;
            });
        } else if (event.action === 'delete') {
            lsearch.deleteDocument(event.data._id, function(err, time) {
                if (err) {
                    handleError(event.type, event.action, event.obj.data._id, err);
                    return;
                }
                handleLog(event.type, event.action, event.obj.data._id, time);
                return;
            });
        } else {
            console.log('Unexpected event: ' + event.type + ' and ' + event.action);
        }
    }
}

exports.handlePostIndex = function(req, callback) {
    var error;

    if (!req.body.type || !req.body.source || !req.body.data) {
        error = 'Invalid arguments given for /search/index POST request.';
        console.error(error);
        return callback(error, {});
    }

    lsearch.indexTypeAndSource(req.body.type, req.body.source, req.body.data, function(err, time) {
        if (err) {
            handleError(req.body.type, 'new', req.body.data._id, err);
            return callback(err, {});
        }
        handleLog(req.body.type, 'new', req.body.data._id, time);
        return callback(null, {timeToIndex: time});
    });
};

exports.handleGetQuery = function(req, callback) {
    var error;
    if (!req.param('q')) {
        error = 'Invalid arguments given for /search/query GET request.';
        console.error(error);
        return callback(error, {});
    }

    var q = lutil.trim(req.param('q'));
    var type;
    var limit;

    if (req.param('type')) {
        type = req.param('type');
    }

    if (req.param('limit')) {
        limit = req.param('limit');
    }

    if (!q || q.substr(0, 1) == '*') {
        error = 'Please supply a valid query string for /search/query GET request.';
        console.error(error);
        return callback(error, {});
    }

    function sendResults(err, results, queryTime) {
        if (err) {
            error = 'Error querying via /search/query GET request: '+JSON.stringify(err);
            console.error(error);
            return callback(error, {});
        }

        if(limit) results = results.slice(0,limit);

        enrichResultsWithFullObjects(results, function(err, richResults) {
            var data = {};
            data.took = queryTime;

            if (err) {
                data.error = err;
                data.hits = [];
                error = 'Error enriching results of /search/query GET request: ' + err;
                return callback(error, data);
            }

            data.error = null;
            data.hits = richResults;
            data.total = richResults.length;
            return callback(null, data);
        });
    }

    if (type) {
        lsearch.queryType(type, q, {}, sendResults);
    } else {
        lsearch.queryAll(q, {}, sendResults);
    }
};

exports.handleGetReindexForType = function(type, callback) {
    // this handleGetReindex method can happen async, but deleteDocumentsByType MUST happen first before the callback.
    // That's why we call it here
    lsearch.deleteDocumentsByType(type, function(err, indexTime) {
        callback(err, {indexTime: indexTime});
    });

    var items;

    if (type == 'contact/full') {
        reindexType(lockerInfo.lockerUrl + '/Me/contacts/allContacts', 'contact/full', 'contacts', function(err) {});
    }
    else if (type == 'photo/full') {
        reindexType(lockerInfo.lockerUrl + '/Me/photos/allPhotos', 'photo/full', 'photos', function(err) {});
    }
    else {
        locker.providers(type, function(err, services) {
            if (!services) return;
            services.forEach(function(svc) {
               if (svc.provides.indexOf('timeline/twitter') >= 0) {
                    reindexType(lockerInfo.lockerUrl + '/Me/' + svc.id + '/getCurrent/home_timeline', 'timeline/twitter', 'twitter/timeline', function(err) {});
                }
            });
        });
    }
};

function reindexType(url, type, source, callback) {
    request.get({uri:url}, function(err, res, body) {
        if (err) {
            console.error('Error when attempting to reindex ' + type + ' collection: ' + err);
            return callback(err);
        }
        if (res.statusCode >= 400) {
            var error = 'Received a ' + res.statusCode + ' when attempting to reindex ' + type + ' collection';
            console.error(err);
            return callback(err);
        }

        items = JSON.parse(body);
        async.forEachSeries(items, function(item, forEachCb) {
            var fullBody = {};
            fullBody.type = type;
            fullBody.source = source;
            fullBody.data = item;
            var req = {};
            req.body = fullBody;
            req.headers = {};
            req.headers['content-type'] = 'application/json';
            exports.handlePostIndex(req, forEachCb);
        },function(err) {
            if (err) {
                console.error(err);
                return callback(err);
            }
            console.log('Reindexing of ' + type + ' completed.');
            return callback(err);
        });
    });
}

function enrichResultsWithFullObjects(results, callback) {
    // fetch full objects of results
    async.waterfall([
        function(waterfallCb) {
            cullAndSortResults(results, function(err, results) {
                waterfallCb(err, results);
            });
        },
        function(results, waterfallCb) {
            async.forEachSeries(results,
                function(item, forEachCb) {
                    var url = lockerInfo.lockerUrl + '/Me/' + item._source + '/' + item._id;
                    makeEnrichedRequest(url, item, forEachCb);
                },
                function(err) {
                    waterfallCb(err, results);
                }
            );
        }
    ],
    function(err, results) {
        if (err) {
            return callback('Error when attempting to sort and enrich search results: ' + err, []);
        }
        return callback(null, results);
    });
}

function cullAndSortResults(results, callback) {
    async.sortBy(results, function(item, sortByCb) {
        // we concatenate the score to the type, and we use the reciprocal of the score so the sort has the best scores at the top
        sortByCb(null, item._type + (1/item.score).toFixed(3));
    },
    function(err, results) {
       callback(null, results);
    });
}

function makeEnrichedRequest(url, item, callback) {
    request.get({uri:url, json:true}, function(err, res, body) {
        if (err) {
            console.error('Error when attempting to enrich search results: ' + err);
            return callback(err);
        }
        if (res.statusCode >= 400) {
            var error = 'Received a ' + res.statusCode + ' when attempting to enrich search results';
            console.error(error);
            return callback(error);
        }

        item.fullobject = body;

        if (item.fullobject.hasOwnProperty('created_at')) {
            var dateDiff = new Date(new Date().getTime() - new Date(item.fullobject.created_at).getTime());
            if (dateDiff.getUTCDate() > 2) {
                item.fullobject.created_at_since = (dateDiff.getUTCDate() - 2) + ' day';
                if (dateDiff.getUTCDate() > 3) item.fullobject.created_at_since += 's';
            } else if (dateDiff.getUTCHours() > 2) {
                item.fullobject.created_at_since = (dateDiff.getUTCHours() - 2) + ' hour';
                if (dateDiff.getUTCHours() > 3) item.fullobject.created_at_since += 's';
            } else if (dateDiff.getUTCMinutes() > 2) {
                item.fullobject.created_at_since = (dateDiff.getUTCMinutes() - 2) + ' minute';
                if (dateDiff.getUTCMinutes() > 3) item.fullobject.created_at_since += 's';
            }
            item.fullobject.created_at_since += ' ago';
        }
        return callback(null);
    });
}

function getSourceForEvent(body) {
    // FIXME: This is a bad hack to deal with the tech debt we have around service type naming and eventing inconsistencies
    var source;

    if (body.type == 'contact/full' || body.type == 'photo/full') {
       var splitType = body.type.split('/');
       source = splitType[0] + 's';
    } else {
        var splitVia = body.via.split('/');
        var splitSource = body.obj.source.split('_');
        source = splitVia[1] + '/' + splitSource[1];
    }
    return source;
    // END FIXME
}

function handleError(type, action, id, error) {
    console.error('Error attempting to index type "' + type + '" with action of "' + action + '" and id: ' + id + ' - ' + error);
}

function handleLog(type, action, id, time) {
    var actionWord;
    switch (action) {
        case 'new':
            actionWord = 'added';
            break;
        case 'update':
            actionWord = 'updated';
            break;
        case 'delete':
            actionWord = 'deleted';
            break;
    }
    console.log('Successfully ' + actionWord + ' ' + type + ' record in search index with id ' + id + ' in ' + time + 'ms');
}

