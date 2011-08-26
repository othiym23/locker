function log(m) { if (console && console.log) console.log(m); }
var app, timeout, appId;
var providers = [];
var userClosed = false;

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
            expandServices();
        });

        $('#service-closer').click(function() {
            userClosed = true;
            $('#services').animate({height: "0px"}, function() {
                $('.services-box').show();
                resizeFrame();
            });
        });
        
        $('#service-selector').delegate('.provider-link', 'click', function() {
            if ($(this).hasClass('disabled')) return false;
            accountPopup($(this).attr('href'));
            return false;
        });

        renderApp();
        
        $(window).resize(resizeFrame);
    }
);

/*
 * SyncletPoll
 */
var SyncletPoll = (
    function () {
        var spinnerOpts = {
            lines: 12,
            length: 5,
            width: 3,
            radius: 8,
            trail: 60,
            speed: 1.0,
            shadow: false
        };
        
        var SyncletPoll = function () {
            var t = this;
            t.uri = "/synclets";
            t.installed = {};

            var app = {};

            t.updateState = function(provider, state) {
                var b =  {
                    "lastState": "",
                    "state": state,
                    "$el": $("#"+provider+"connect")
                };

                // use the existing object if it exists
                if (typeof(t.installed[provider]) != "undefined") {
                    b.$el.find('a').addClass("disabled");
                    b = t.installed[provider];
                    b.state = state;
                }

                if (b.lastState == b.state) return;

                // log("["+provider+"] " + state);

                if (b.state == "running" || b.state == "processing data") {
                    if (typeof(b.spinner) == "undefined") {
                        var target = b.$el.find(".spinner")[0];
                        b.$el.find('a').addClass("disabled");
                        b.spinner = new Spinner(spinnerOpts).spin(target);
                    } else if (!(b.find('.checkmark').is(':visible'))) {
                        b.spinner.spin();
                    }
                } else if (b.state == "waiting") {
                    if (b.spinner) b.spinner.stop();
                    b.$el.find('.checkmark').show();
                }

                b.lastState = b.state;
                t.installed[provider] = b;
            };

            t.handleResponse = function(data, err, resp) {
                for (app in data.installed) {
                    app = data.installed[app];

                    if (providers.indexOf(app.provider) != -1) {
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
            $('.service:not(.template)').remove();
            providers = [];
            for (var i in data.uses) {
                for (var j = 0; j < synclets.available.length; j++) {
                    if (synclets.available[j].provider === data.uses[i]) {
                        providers.push(data.uses[i]);
                        drawService(synclets.available[j]);
                    }
                }
            }
            window.syncletPoll = new SyncletPoll(providers);
        });
    });
}

function drawService(synclet) {
    var newService = $('.service.template').clone();
    newService.find('.provider-icon').attr('src', 'img/icons/' + synclet.provider + '.png');
    newService.find('.provider-link').attr('href', synclet.authurl);
    newService.find('.provider-name').text(synclet.provider);
    newService.removeClass('template');
    newService.attr('id', synclet.provider + 'connect');
    $('#service-selector').append(newService);
};

// this needs some cleanup to actually use the proper height + widths
function accountPopup (url) {
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
        (function poll (data) {
            $.getJSON(data[app].url + "ready", function(state) {
                ready = state;
                if (ready) {
                    // log('clearing timeout');
                    $("#appFrame")[0].contentWindow.location.replace(data[app].url);
                    clearTimeout(timeout);
                }
                else {
                    if (!userClosed && $('#services').height() === 0) expandServices();
                    if (!timeout) {
                        // log('loading page');
                        $("#appFrame")[0].contentWindow.location.replace(data[app].url + "notready.html");
                    }
                    timeout = setTimeout(function() {poll(data)}, 1000);
                    // log(timeout);
                }
            });
        })(data);
    });
};

function expandServices() {
    $('.services-box').hide();
    drawServices();
    $('#services').animate({height: "110px"}, function() {
        resizeFrame();
    });
}

function resizeFrame() {
    $('#appFrame').height($(window).height() - $('#services').height() - $('.header').height() - 6);
}