/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var express = require('express'),
    connect = require('connect'),
    async = require('async'),
    fs = require('fs'),
    socketio = require('socket.io'),
    request = require('request');

var externalBase;
var locker;
module.exports = function(passedLocker, passedExternalBase, listenPort, callback) {
    locker = passedLocker;
    externalBase = passedExternalBase;
    app.use(express.static(__dirname + '/static'));
    app.listen(listenPort, callback);
}

var app = express.createServer();
app.use(connect.bodyParser());
// dumb defaults
var options = { logger: {
   info: new Function(),
   error: new Function(),
   warn: new Function(),
   debug: new Function()
 }};
var io = socketio.listen(app,options);

app.get('/apps', function(req, res) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    var apps = {contacts: {url : externalBase + '/Me/contactsviewer/', id : 'contactsviewer'},
                photos: {url : externalBase + '/Me/photosviewer/', id : 'photosviewer'},
                links: {url : externalBase + '/Me/linkalatte/', id : 'linkalatte'},
                search: {url : externalBase + '/Me/searchapp/', id : 'searchapp'}}
    res.end(JSON.stringify(apps));
});

var eventInfo = {
    "link":{"name":"link", "timer":null, "count":0, "new":0},
    "contact/full":{"name":"contact", "timer":null, "count":0, "new":0},
    "photo":{"name":"photo", "timer":null, "count":0, "new":0}
};

// lame way to track if any browser is actually open right now
var isSomeoneListening = 0;

app.post('/event', function(req, res) {
    res.send({}); // any positive response
    if(isSomeoneListening == 0) return; // ignore if nobody is around, until we have an unlisten option
    console.log("Sending event on socket.io");
    if (req && req.body) {
        var evInfo = eventInfo[req.body.type];
        evInfo.new++;
        if (evInfo.timer) {
            clearTimeout(evInfo.timer);
        }
        evInfo.timer = setTimeout(function() {
            io.sockets.emit('event',{"name":evInfo.name, "count":evInfo.new});
            evInfo.count += evInfo.new;
            evInfo.new = 0;
            saveState();
        }, 2000);
    }
});


// just snapshot to disk every time we push an event so we can compare in the future
function saveState()
{
    fs.writeFileSync("state.json", JSON.stringify(eventInfo));
}

// compare last-sent totals to current ones and send differences
function bootState()
{
    if(isSomeoneListening > 0) return; // only boot after we've been idle
    console.error("booting state fresh");
    async.forEach(['contacts','links','photos'],function(coll,callback){
        console.error("fetching "+locker.lockerBase+'/Me/'+coll+'/state '+ JSON.stringify(locker) );
        request.get({uri:locker.lockerBase+'/Me/'+coll+'/state'},function(err,res,body){
            if(coll == 'links') var evInfo = eventInfo['link'];
            if(coll == 'photos') var evInfo = eventInfo['photo'];
            if(coll == 'contacts') var evInfo = eventInfo['contact/full'];
            evInfo.count = (body && body.count && body.count > 0) ? body.count : 0;
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
        }
        for(var type in eventInfo) {
            // stupd vrbos
            if(eventInfo[type].count > last[type].count) io.sockets.emit('event',{"name":eventInfo[type].name, "count":eventInfo[type].count - last[type].count});
        }
        saveState(); // now that we possibly pushed events, note it
        locker.listen("photo","/event");
        locker.listen("link","/event");
        locker.listen("contact/full","/event");        
    });
}

io.sockets.on('connection', function (socket) {
    console.error("got new socket.io connection");
    bootState();
    isSomeoneListening++;
    socket.on('disconnect', function () {
        isSomeoneListening--;
      });
});
