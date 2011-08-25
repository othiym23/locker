function log(m) { if (console && console.log) console.log(m); }

$(document).ready(
    function() {
        var app = '';

        $('#main .body').delegate('.box', 'click', function() {
            console.log('BOW');
            app = $(this).attr('id');
            $.mobile.changePage("app.html#" + app);
        });
    }
);