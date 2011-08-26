function log(m) { if (console && console.log) console.log(m); }
var app, timeout, appId;

$(document).ready(
    function() {
        app = window.location.hash.substring(1);

        $('.app-select').click(function() {
            $('.app-select').toggleClass('on');
            $('.children').toggle();
        });

        $('.app-link').click(function() {
            app = $(this).attr('id');
            renderApp();
            return false;
        });

        $('.services-box').click(function() {
            $('#services').animate({height: "110px"}, function() {
                $('.services-box').hide();
            });
        });

        $('#service-closer').click(function() {
            $('#services').animate({height: "0px"}, function() {
                $('.services-box').show();
            });
        });

        renderApp();
    }
);

/*
 * SyncletPoll
 */
var SyncletPoll = (
    function () {
        var SyncletPoll = function () {
            var t = this;
            t.uri = "/synclets";
            t.buttonsConnected = false;
            t.installed = {};

            var app = {};

            t.updateState = function(provider, state) {
                var b =  {
                    "lastState": "",
                    "state": state,
                    "$el": $("#"+provider+"Connect a:first")
                };

                // use the existing object if it exists
                if (typeof(t.installed[provider]) != "undefined") {
                    b = t.installed[provider];
                    b.state = state;
                }

                if (b.lastState == b.state) {
                    return;
                }

                log("["+provider+"] " + state);

                if (b.state == "running" || b.state == "processing data") {

                    b.$el.addClass("pending disabled");

                    if ($("#wizard-collections:visible").length == 0) {
                        $("#wizard-collections").slideDown();
                        $("#wizard-actions").fadeIn();
                        $("#popup h2").html(_s[1].action).next().html(_s[1].desc);
                    }
                    b.$el.parent().parent().children(".spinner").html("").fadeIn();
                    if (typeof(b.spinner) == "undefined") {
                        b.spinner = spinner(b.$el.parent().parent().children(".spinner").get(0), 15, 20, 20, 4, "#aaa");
                    }
                } else if (b.state == "waiting") {
                    b.$el.removeClass("pending");
                    b.$el.parent().parent().children(".spinner").html("&#x2713;").fadeIn();
                    delete b.spinner;
                }

                b.lastState = b.state;
                t.installed[provider] = b;

            };

            t.handleResponse = function(data, err, resp) {
                var wizardApps = ["facebook", "twitter", "gcontacts", "github", "foursquare"];
                if (!t.buttonsConnected) {
                    var authTokensExist = false;
                    for (app in data.available) {
                        app = data.available[app];

                        if (wizardApps.indexOf(app.provider) != -1 && typeof(app.authurl) != "undefined") {
                            // update app button with the correct link
                            var $el = $("#"+ app.provider + "Connect a:first");
                            // change link
                            $el.attr("href", app.authurl);
                            $el.attr("target", "_blank");
                            authTokensExist = true;
                        }
                    }
                    t.buttonsConnected = true;
                    if (!authTokensExist) {
                        // bail out if synclets have no authtokens
                        $.mobile.changePage("#noApiKeys");
                    }
                }

                for (app in data.installed) {
                    app = data.installed[app];

                    if (wizardApps.indexOf(app.provider) != -1) {
                        // update app button with "pending" gfx
                        t.updateState(app.provider, app.status);
                    }
                }

                t.timeout = setTimeout(t.query, 1000);
            };

            t.query = function() {
                var url = t.uri;
                $.ajax({
                           url: url,
                           dataType: 'json',
                           success: t.handleResponse,
                           error: function(e) {
                               // assume it will become available later
                               t.timeout = setTimeout(t.query, 3000);
                           }
                       });
            };

            t.halt = function() {
                clearTimeout(t.timeout);
            };

            // init
            t.query();
        };

        return function () {
            return new SyncletPoll();
        };

    })();

function drawServices() {
    $.getJSON('/available?handle=' + appId, function(data) {
        $.getJSON('/synclets', function(synclets) {
            for (var i in data.uses) {
                for (var j = 0; j < synclets.available.length; j++) {
                    if (synclets.available[j].provider === data.uses[i]) {
                        drawService(synclets.available[i]);
                    }
                }
            }
        });
    });
    window.syncletPoll = new SyncletPoll();
}

function drawService(synclet) {
    log(synclet);
};

// this needs some cleanup to actually use the proper height + widths
function accountPopup (url, provider) {
    var oauthPopupSizes = {foursquare: {height: 540,  width: 960},
                 github: {height: 1000, width: 1000},
                 twitter: {width: 980, height: 750}
                };
    var popup = window.open(url, "account", "width=620,height=400,status=no,scrollbars=no,resizable=no");
    popup.focus();
}

function renderApp() {
    var ready = false;

    if (timeout) clearTimeout(timeout);
    $('.selected').removeClass('selected');
    $("#" + app).addClass('selected');
    $.getJSON('apps', function(data) {
        var ready = false;
        if (!data[app]) return;
        appId = data[app].id;
        drawServices();
        (function poll (data) {
            $.getJSON(data[app].url + "ready", function(state) {
                ready = state;
                if (ready) {
                    log('clearing timeout');
                    $("#appFrame")[0].contentWindow.location.replace(data[app].url);
                    clearTimeout(timeout);
                }
                else {
                    if (!timeout) {
                        log('loading page');
                        $("#appFrame")[0].contentWindow.location.replace(data[app].url + "notready.html");
                    }
                    timeout = setTimeout(function() {poll(data)}, 1000);
                    log(timeout);
                }
            });
        })(data);
    });
};