/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

// merge contacts from connectors
var lconfig = require(__dirname + "/../../Common/node/lconfig")
  , fs = require('fs')
  , sync = require(__dirname + '/sync')
  , dataStore = require(__dirname + "/dataStore")
  , events = require(__dirname + "/../../Common/node/locker").events
  , lmongo = require(__dirname + "/../../Common/node/lmongo")
  , lockerInfo
  ;

module.exports = function(app, svcInfo) {

    var prefix = "/Me/" + svcInfo.id;

    app.get(prefix + '/', function(req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/html'
        });
        dataStore.getTotalCount(function(err, countInfo) {
            res.write('<html><p>Found '+ countInfo +' contacts</p><a href="update">refresh from connectors</a></html>');
            res.end();
        });
    });

    app.get(prefix + '/state', function(req, res) {
        dataStore.getTotalCount(function(err, countInfo) {
            if(err) return res.send(err, 500);
            var updated = new Date().getTime();
            try {
                var js = JSON.parse(fs.readFileSync('state.json'));
                if(js && js.updated) updated = js.updated;
            } catch(E) {}
            res.send({ready:1, count:countInfo, updated:updated});
        });
    });


    app.get(prefix + '/allContacts', function(req, res) {
        res.writeHead(200, {
            'Content-Type':'application/json'
        });
        dataStore.getAll(function(err, cursor) {
            cursor.toArray(function(err, items) {
                res.end(JSON.stringify(items));
            });
        });
    });

    app.get(prefix + '/update', function(req, res) {
        sync.gatherContacts(function(){
            res.writeHead(200);
            res.end('Updating');
        });
    });

    for (var i = 0; i < svcInfo.events.length; i++) {
        events.on(svcInfo[i], function(eventObj) {
            dataStore.addEvent(eventObj, function(err, finalObj) {
                if (err) {
                    console.log('failed to process event in contacts collection - ' + err);
                } else {
                    if (finalObj) {
                        events.emit('contact/full', finalObj);
                    }
                }
            });
        });
    }

    app.get(prefix + '/:id', function(req, res, next) {
        if (req.param('id').length != 24) return next(req, res, next);
        dataStore.get(req.param('id'), function(err, doc) {
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(doc));
        })
    });


    lmongo.init('contacts', svcInfo.mongoCollections, function(mongo) {
        sync.init(mongo.collections.contacts.contacts, mongo, svcInfo.id);
    });
}
