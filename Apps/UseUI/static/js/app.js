function log(m) { if (console && console.log) console.log(m); }
var app;

$(document).ready(
    function() {
        app = window.location.hash;

        $('.app-select').click(function() {
            $('.app-select').toggleClass('on');
            $('.children').toggle();
        });

        $('.app-link').click(function() {
            app = "#" + $(this).attr('id');
            renderIframe();
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

        renderIframe();
    }
);

function renderIframe() {
    $('.selected').removeClass('selected');
    console.log(app);

    $(app).addClass('selected');
};