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
    "link":{"name":"link", "timer":null, "count":0},
    "contact/full":{"name":"contact", "timer":null, "count":0},
    "photo":{"name":"photo", "timer":null, "count":0}
};

app.post('/event', function(req, res) {
    console.log("Sending event on socket.io");
    if (req && req.body) {
        var evInfo = eventInfo[req.body.type];
        evInfo.count++;
        if (evInfo.timer) {
            clearTimeout(evInfo.timer);
        }
        evInfo.timer = setTimeout(function() {
            io.sockets.emit('event',{"name":evInfo.name, "count":evInfo.count});
        }, 2000);
    }
    res.send({}); // any positive response
});

io.sockets.on('connection', function (socket) {
    console.error("got new socket.io connection, adding listeners");
    locker.listen("photo","/event");
    locker.listen("link","/event");
    locker.listen("contact/full","/event");
});
