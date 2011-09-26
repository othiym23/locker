/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var express = require('express')
  , path = require('path')
  , locker
  , async = require('async')
  , fs = require('fs')
  , socketio = require('socket.io')
  , request = require('request')
  , logger = require("logger").logger
  , lconfig = require(__dirname + '/../../Common/node/lconfig')
  , events = require(__dirname + '/../../Common/node/locker').events
  , externalBase = lconfig.externalBase
  , options = {
      logger: {
          info: new Function(),
          error: new Function(),
          warn: new Function(),
          debug: new Function()
      }}
  , io
// dumb defaults
  , eventInfo = {
      "link":{"name":"link", "timer":null, "count":0, "new":0, "updated":0},
      "contact/full":{"name":"contact", "timer":null, "count":0, "new":0, "updated":0},
      "photo":{"name":"photo", "timer":null, "count":0, "new":0, "updated":0}
    }
// lame way to track if any browser is actually open right now
  , isSomeoneListening = 0
  ;

var isSomeoneListening = 0;


module.exports = function(app, svcInfo) {

    var prefix = '/Me/' + svcInfo.id;

    app.use(prefix, express.cookieParser());

    app.set('views', __dirname + '/views');
    app.set('view engine', 'ejs');
    app.set('view options', {
      layout: false
    });
    app.use(prefix, express.bodyParser());
    app.use(prefix, express.static(__dirname + '/static'));

    io = socketio.listen(app,options);

    app.get(prefix + '/app', function(req, res) {
        fs.readFile(path.join(lconfig.lockerDir, lconfig.me, 'gitrev.json'), 'utf8', function(err, rev) {
            var customFooter;
            if (lconfig.dashboard && lconfig.dashboard.customFooter) {
                customFooter = fs.readFileSync(__dirname + '/views/' + lconfig.dashboard.customFooter, 'utf8');
            }
            res.render('app', {
                dashboard: lconfig.dashboard,
                customFooter: customFooter,
                revision: rev.substring(1,11)
            });
        });
    });

    app.get(prefix + '/apps', function(req, res) {
        res.writeHead(200, {'Content-Type': 'application/json'});
        var apps = {contacts: {url : externalBase + '/Me/contactsviewer/', id : 'contactsviewer'},
                    photos: {url : externalBase + '/Me/photosviewer/', id : 'photosviewer'},
                    links: {url : externalBase + '/Me/linkalatte/', id : 'linkalatte'},
                    search: {url : externalBase + '/Me/searchapp/', id : 'searchapp'}};
        res.end(JSON.stringify(apps));
    });


    function processEvent(event) {
        if(isSomeoneListening == 0) return; // ignore if nobody is around, shouldn't be getting any anyway
        var evInfo = eventInfo[event.type];
        evInfo.new++;
        if (evInfo.timer) {
            clearTimeout(evInfo.timer);
        }
        evInfo.timer = setTimeout(function() {
            evInfo.count += evInfo.new;
            evInfo.updated = new Date().getTime();
            io.sockets.emit('event',{"name":evInfo.name, "new":evInfo.new, "count":evInfo.count, "updated":evInfo.updated});
            evInfo.new = 0;
            saveState();
        }, 2000);
    }

    // just snapshot to disk every time we push an event so we can compare in the future
    function saveState()
    {
        var counts = {};
        for (var key in eventInfo) {
            if (eventInfo.hasOwnProperty(key)) counts[key] = {count:eventInfo[key].count};
        }
        fs.writeFile(path.join(lconfig.lockerDir, lconfig.me, svcInfo.id, "state.json"), JSON.stringify(counts));
    }

    // compare last-sent totals to current ones and send differences
    function bootState()
    {
        if(isSomeoneListening > 0) return; // only boot after we've been idle
        logger.debug("booting state fresh");
        async.forEach(['contacts','links','photos'],function(coll,callback){
            logger.debug("fetching "+externalBase+'/Me/'+coll+'/state '+ JSON.stringify(locker) );
            request.get({uri: path.join(externalBase, 'Me', coll, 'state'),json:true},function(err,res,body){
                if(coll == 'links') var evInfo = eventInfo['link'];
                if(coll == 'photos') var evInfo = eventInfo['photo'];
                if(coll == 'contacts') var evInfo = eventInfo['contact/full'];
                evInfo.count = (body && body.count && body.count > 0) ? body.count : 0;
                evInfo.updated = (body && body.updated && body.updated > 0) ? body.updated : 0;
                callback();
            });
        },function(){
            var last = {
                "link":{"count":0},
                "contact/full":{"count":0},
                "photo":{"count":0}
            };
            // try to load from file passively
            try {
                last = JSON.parse(fs.readFileSync('state.json'));
            } catch(err) {
                last = {};
            }
            for(var type in eventInfo) {
                // stupd vrbos
                if (last[type]) {
                    if(eventInfo[type].count > last[type].count) io.sockets.emit('event',{"name":eventInfo[type].name, "updated":eventInfo[type].updated, "new":eventInfo[type].count - last[type].count});
                }
            }
            saveState(); // now that we possibly pushed events, note it
            events.on("photo", processEvent);
            events.on("link", processEvent);
            events.on("contact/full", processEvent);
            var counts = {};
            for (var key in eventInfo) {
                if (eventInfo.hasOwnProperty(key)) counts[eventInfo[key].name] = {count:eventInfo[key].count, updated:eventInfo[key].updated};
            }
            io.sockets.emit("counts", counts);
        });
    }

    io.sockets.on('connection', function (socket) {
        logger.debug("+++++++++++++++");
        logger.debug("++++++++++ got new socket.io connection");
        logger.debug("+++++++++++++++");
        bootState();
        isSomeoneListening++;
        var counts = {};
        for (var key in eventInfo) {
            if (eventInfo.hasOwnProperty(key)) counts[eventInfo[key].name] = {count:eventInfo[key].count, updated:eventInfo[key].updated};
        }
        socket.emit("counts", counts);
        socket.on('disconnect', function () {
            isSomeoneListening--;
            // when nobody is around, don't receive events anymore
            if(isSomeoneListening == 0)
            {
                logger.debug("everybody left, quiesce");
                events.removeListener('photo', processEvent);
                events.removeListener('link', processEvent);
                events.removeListener('contact/full', processEvent);
            }
        });
    });
}


