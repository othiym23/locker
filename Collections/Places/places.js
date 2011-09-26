/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

// merge places from connectors

var fs = require('fs'),
    url = require('url'),
    request = require('request'),
    locker = require(__dirname + '/../../Common/node/locker.js');
var events = locker.events;
var async = require("async");
var lmongo = require(__dirname + '/../../Common/node/lmongo');
var path = require('path');
var dataIn = require('./dataIn'); // for processing incoming twitter/facebook/etc data types
var dataStore = require("./dataStore"); // storage/retreival of raw places
var util = require("./util"); // handy things for anyone and used within place processing

var lockerInfo;
var express = require('express');

module.exports = function(app, svcInfo) {

    var prefix = path.join("/Me/", svcInfo.id);

    app.get(prefix + '/', function(req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/html'
        });
        dataStore.getTotalPlaces(function(err, countInfo) {
            res.write('<html><p>Found '+ countInfo +' places</p></html>');
            res.end();
        });
    });

    app.get(prefix + '/state', function(req, res) {
        dataStore.getTotalPlaces(function(err, countInfo) {
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


    app.get(prefix + '/update', function(req, res) {
        dataIn.reIndex(locker,function(){
            res.writeHead(200);
            res.end('Making cookies for temas!');
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


    genericApi('/getPlaces', dataStore.getPlaces);
    // expose all utils
    for(var f in util)
    {
        if(f == 'init') continue;
        genericApi('/'+f,util[f]);
    }

    lmongo.init('places', svcInfo.mongoCollections, function(mongo) {
        dataStore.init(mongo.collections.places.place, svcInfo.id);
        dataIn.init(dataStore, svcInfo.id);
    });
}
