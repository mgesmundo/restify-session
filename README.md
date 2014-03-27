# restify-session

This module is made to manage session without cookies in a REST server powered by [restify](1).
Please install [Redis](2) (>=2.0.0) in your server to enable this module.
To create documentation you must install [JSDuck](https://github.com/senchalabs/jsduck) and type in your terminal:

    $ ./gen_doc.sh

## Motivation

When you need to access to your REST server with session from a javascript app for iOS bundled as native app using [Phonegap/Cordova](3), you can't use cookies because since iOS 5 these are disables by default.

## Installation

Install `restify-session` as usual:

    $ npm install --save restify-session

## Usage

Is very simple to enable session:

    // dependencies
    var restify = require('restify'),
        session = require('restify-session')({
            debug : true,
            ttl   : 2
        });

    // create the server
    var server  = restify.createServer();

    // attach the session manager
    server.use(session.sessionManager)

    // attach a route
    server.get('/', function(req, res, next){
       res.send({ success: true, session: req.session });
       return next();
    });

    // start the server
    server.listen(3000);

Save this file as server.js and start it in a terminal window:

    $ node server.js

Open your browser and put the address of your server:

    http://localhost:3000

Now you see an answer like this:

    {"success":true,"session":{"sid":"ViS5pHE5n8McblTATbyFUJTGJyzVFeXOcAEZ41Zs"}}

You can see your session id (sid) into the response header:

    Session-Id ViS5pHE5n8McblTATbyFUJTGJyzVFeXOcAEZ41Zs

See full documentation into _doc_ folder.

## Run Tests

All tests are written in mocha and designed to be run with npm:

    $ npm test


[1]: https://www.npmjs.org/package/restify
[2]: http://redis.io
[3]: https://www.npmjs.org/package/phonegap