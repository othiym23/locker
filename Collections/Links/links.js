/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

// merge links from connectors

var fs = require('fs')
  , url = require('url')
  , request = require('request')
  , lconfig = require('../../Common/node/lconfig.js')
  , locker = require('../../Common/node/locker.js')
  , lmongo = require('../../Common/node/lmongo.js')
  , async = require("async")
  , path = require('path')
  , dataIn = require('./dataIn') // for processing incoming twitter/facebook/etc data types
  , dataStore = require("./dataStore") // storage/retreival of raw links and encounters
  , util = require("./util") // handy things for anyone and used within dataIn
  , search = require("./search") // our indexing and query magic
  , lockerInfo
  , express = require('express')
  , events = locker.events
  ;

module.exports = function(app, svcInfo) {
    var prefix = path.join('/Me/', svcInfo.id);

    app.get(prefix + '/', function(req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/html'
        });
        dataStore.getTotalLinks(function(err, countInfo) {
            res.write('<html><p>Found '+ countInfo +' links</p></html>');
            res.end();
        });
    });

    app.get(prefix + '/state', function(req, res) {
        dataStore.getTotalLinks(function(err, countInfo) {
            if(err) return res.send(err, 500);
            var updated = new Date().getTime();
            fs.readFile(path.join(lconfig.lockerDir, lconfig.me, svcInfo.id, 'state.json'), function(err, js) {
                if (err) { return res.send({ready:1, count:countInfo, updated:updated}); }
                js = JSON.parse(js);
                if(js && js.updated) updated = js.updated;
                res.send({ready:1, count:countInfo, updated:updated});
            });
        });
    });

    app.get(prefix + '/search', function(req, res) {
        if (!req.query.q) {
            res.send([]);
            return;
        }
        search.search(req.query["q"], function(err,results) {
            if(err || !results || results.length == 0) return res.send([]);
            var fullResults = [];
            async.forEach(results, function(item, callback) {
                dataStore.getFullLink(item._id, function(link) {
                    if (!link) {
                        console.error("skipping not found: "+item._id);
                        return callback();
                    }
                    link.at = item.at;
                    link.encounters = [];
                    dataStore.getEncounters({"link":link.link}, function(encounter) {
                        link.encounters.push(encounter);
                    }, function() {
                        fullResults.push(link);
                        callback();
                    });
                });
            }, function() {
                // Done
                var sorted = fullResults.sort(function(lh, rh) {
                    return rh.at - lh.at;
                });
                res.send(sorted);
            });
        });
    });

    app.get(prefix + '/update', function(req, res) {
        dataIn.reIndex(locker, function(){
            res.writeHead(200);
            res.end('Extra mince!');
        });
    });

    // just add embedly key and return result: http://embed.ly/docs/endpoints/1/oembed
    // TODO: should do smart caching
    app.get(prefix + '/embed', function(req, res) {
        // TODO: need to load from apiKeys the right way
        var embedly = url.parse("http://api.embed.ly/1/oembed");
        embedly.query = req.query;
        embedly.query.key = "4f95c324c9dc11e083104040d3dc5c07";
        request.get({uri:url.format(embedly)},function(err,resp,body){
            var js;
            try{
                if(err) throw err;
                js = JSON.parse(body);
            }catch(E){
                res.writeHead(500, {'Content-Type': 'text/plain'});
                res.end(err);
                return;
            }
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(js));
        });
    });







    for (var i = 0; i < svcInfo.events.length; i++) {
        events.on(svcInfo.events[i], function(eventObj) {
            dataIn.processEvent(eventObj);
        });
    }

    function genericApi(name,f)
    {
        app.get(prefix + name,function(req,res){
            var results = [];
            f(req.query,function(item){results.push(item);},function(err){
                if(err)
                {
                    res.writeHead(500, {'Content-Type': 'text/plain'});
                    res.end(err);
                }else{
                    res.writeHead(200, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify(results));
                }
            });
        });
    }

    // expose way to get raw links and encounters
    app.get(prefix + '/getLinksFull', function(req, res) {
        var fullResults = [];
        var results = [];
        var options = {sort:{"at":-1}};
        if (req.query.limit) {
            options.limit = parseInt(req.query.limit);
        }
        if (req.query.offset) {
            options.offset = parseInt(req.query.offset);
        }
        dataStore.getLinks(options, function(item) { results.push(item); }, function(err) {
            async.forEach(results, function(link, callback) {
                link.encounters = [];
                dataStore.getEncounters({"link":link.link}, function(encounter) {
                    link.encounters.push(encounter);
                }, function() {
                    fullResults.push(link);
                    callback();
                });
            }, function() {
                res.send(results);
            });
        });
    });
    genericApi('/getLinks', dataStore.getLinks);
    genericApi('/getEncounters',dataStore.getEncounters);

    // expose all utils
    for(var f in util)
    {
        if(f == 'init') continue;
        genericApi('/'+f,util[f]);
    }

    lmongo.init('links', svcInfo.mongoCollections, function(mongo) {
        dataStore.init(mongo.collections.links.link, mongo.collections.links.encounter, mongo.collections.links.queue, svcInfo.id);
        search.init(dataStore, svcInfo.id);
        dataIn.init(dataStore, search, svcInfo.id);
        dataIn.loadQueue();
    });
}
