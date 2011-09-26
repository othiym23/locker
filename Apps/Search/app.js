/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var fs = require('fs'),
    http = require('http'),
    url = require('url');

var express = require('express');

var locker = require(__dirname + '/../../Common/node/locker'),
    lconfig = require(__dirname + '/../../Common/node/lconfig'),
    lutil = require(__dirname + '/../../Common/node/lutil'),
    path = require('path')
    search = require('./lib/lockersearch/index.js');

var DEBUG_SEARCH_OUTPUT = false;
var me;

module.exports = function(app, svcInfo) {

    me = svcInfo;
    var prefix = "/Me/" + svcInfo.id;

    // Config
    app.register('.jade', require('jade'));
    app.set('view options', {layout: true});
    app.set(prefix, 'views', __dirname + '/views');
    app.use(prefix, express.bodyParser());
    app.use(prefix, express.methodOverride());
    app.use(prefix, express.static(__dirname + '/public'));
    app.use(prefix, express.cookieParser());
    app.use(prefix, express.session({ secret: 'locker'}));

    // Routes
    app.get(prefix + '/', function(req, res) {
       res.render(__dirname + '/views/index.jade', {
           error: null,
           homePath: '/Me/' + me.id,
           searchPath: '/Me/' + me.id + '/search',
           term: ''
        });
    });

    app.get(prefix + '/search', function(req, res) {
        var term = lutil.sanitize(req.param('searchterm'));
        console.error('term: ' + term);
        var type = lutil.sanitize(req.param('type'));
        var results = [];
        var error = null;

        search.search(type, term, 0, 10, function(err, results) {

          if (!results || !results.hasOwnProperty('hits') || !results.hits.hasOwnProperty('hits')) {
              console.error('No results object returned for search');
              results = {};
              results.hits = {};
              results.hits.hits = [];
              results.took = 1;
              results.hits.total = 0;
          }

          res.render(__dirname + '/views/search.jade', {
            term: term,
            homePath: '/Me/' + me.id,
            searchPath: '/Me/' + me.id + '/search',
            results: results.hits.hits,
            took: results.took,
            total: results.hits.total,
            raw: DEBUG_SEARCH_OUTPUT?JSON.stringify(results):false,
            error: err
          });
        });
    });

    app.get(prefix + '/indexContacts', function(req, res) {
        indexCollectionRecordsOfType('contacts', '/Me/contacts/allContacts', function(err, results) {
          if (err) {
            res.end('Error when attempting to index');
          } else {
            res.end('Indexed ' + results.count + ' contacts');
          }
        });
    });

    app.get(prefix + '/indexLinks', function(req, res) {
        indexCollectionRecordsOfType('links', '/Me/links/allLinks', function(err, results) {
          if (err) {
            res.end('Error when attempting to index');
          } else {
            res.end('Indexed ' + results.count + ' links');
          }
        });
    });

    app.get(prefix + '/indexMessages', function(req, res) {
        indexCollectionRecordsOfType('messages', '/Me/messages/allMessages', function(err, results) {
          if (err) {
            res.end('Error when attempting to index');
          } else {
            res.end('Indexed ' + results.count + ' messages');
          }
        });
    });

    app.get(prefix + '/ready', function(req, res) {
        res.writeHead(200);
        res.end('true');
    });

    function indexCollectionRecordsOfType(type, urlPath, callback) {

      var lockerUrl = url.parse(lconfig.lockerBase);
      var options = {
        host: lockerUrl.hostname,
        port: lockerUrl.port,
        path: urlPath,
        method:'GET'
      };

      var data = '';
      var jsonDelim = 0;

      var req = http.get(options, function(res) {
        res.setEncoding('utf8');

        res.on('data', function (chunk) {
          data += chunk;
        });

        res.on('end', function() {
          search.map(type);
          var results = JSON.parse(data);
          for (var i in results) {
            search.index(results[i]._id, type, results[i], function(err, result) {
              if (err) {
                console.error('error indexing ' + type + ' with ID of ' + results[i]._id);
                callback(err);
              }
            });
          }
        });
      });

      req.on('error', function(e) {
        console.error('problem with request: ' + e.message);
      });
    }
}
