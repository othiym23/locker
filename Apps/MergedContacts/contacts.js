/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var lconfig = require(__dirname + "/../../Common/node/lconfig");
var request = require('request');
var express = require('express');

module.exports = function(app, svcInfo) {
    var lockerBase = lconfig.lockerBase;
    var prefix = '/Me/' + svcInfo.id;

    app.get(prefix + '/ready', function(req, res) {
        res.writeHead(200);
        request.get({url:lockerBase + '/Me/contacts/state'}, function(err, resp, body) {
            if(JSON.parse(body).count > 0) {
                res.end('true');
                return;
            }
            res.end('false');
        });
    });

    app.use(prefix, express.static(__dirname + '/static'));
}
