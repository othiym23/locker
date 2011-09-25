/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

// merge contacts from connectors

var locker = require('../../Common/node/locker.js')
  , fs = require('fs')
  , sync = require('./sync')
  , dataStore = require("./dataStore")
  , logger = require("../../Common/node/logger.js").logger
  , lockerInfo
  , lmongo = require('../../Common/node/lmongo.js')
  , request = require('request')
  , events = locker.events
  ;

module.exports = function(app, svcInfo) {

    var prefix = "/Me/" + svcInfo.id;

    app.get(prefix + '/', function(req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/html'
        });
        dataStore.getTotalCount(function(err, countInfo) {
            res.write('<html><p>Found '+ countInfo +' photos</p>(<a href="update">Update</a>)</html>');
            res.end();
        });
    });

    app.get(prefix + '/state', function(req, res) {
        dataStore.getTotalCount(function(err, countInfo) {
            if (err) return res.send(err, 500);
            var updated = new Date().getTime();
            try {
                var js = JSON.parse(fs.readFileSync('state.json'));
                if(js && js.updated) updated = js.updated;
            } catch(E) {}
            res.send({ready:1, count:countInfo, updated:updated});
        });
    });


    app.get(prefix + '/allPhotos', function(req, res) {
        dataStore.getAll(function(err, cursor) {
            if(req.query["limit"]) cursor.limit(parseInt(req.query["limit"]));
            if(req.query["skip"]) cursor.skip(parseInt(req.query["skip"]));
            cursor.toArray(function(err, items) {
                res.send(items);
            });
        });
    });

    app.get(prefix + "/fullPhoto/:photoId", function(req, res) {
        if (!req.params.photoId) {
            res.writeHead(500);
            res.end("No photo id supplied");
            return;
        }
        dataStore.getOne(req.params.photoId, function(error, data) {
            if (error) {
                res.writeHead(500);
                res.end(error);
            } else {
                res.writeHead(302, {"location":data.url});
                res.end("");
            }
        })
    });

    app.get(prefix + "/getPhoto/:photoId", function(req, res) {
        dataStore.getOne(req.params.photoId, function(error, data) {
            if (error) {
                res.writeHead(500);
                res.end(error);
            } else {
                res.writeHead(200, {"Content-Type":"application/json"});
                res.end(JSON.stringify(data));
            }
        })
    });

    app.get(prefix + '/:id', function(req, res, next) {
        if (req.param('id').length != 24) return next(req, res, next);
        dataStore.get(req.param('id'), function(err, doc) {
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(doc));
        })
    });

    app.get(prefix + '/update', function(req, res) {
        sync.gatherPhotos(function(){
            res.writeHead(200);
            res.end('Updating');
        });
    });

    for (var i = 0; i < svcInfo.events.length; i++) {
        events.on(svcInfo[i], function(eventObj) {
            dataStore.processEvent(eventObj, function(err) {
                if (err) {
                    logger.debug('error processing: ' + err);
                }
            });
        });
    }

    lmongo.init('photos', svcInfo.mongoCollections, function(mongo) {
        sync.init(mongo.collections.photos.photos, mongo, svcInfo.id);
    });
}
