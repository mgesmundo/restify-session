/**
 * @class node_modules.restify_session
 *
 * @author Marcello Gesmundo
 *
 * This module manage session for a restify server without cookies. It uses Redis (>=2.0.0) as fast session store.
 * Derived from redis-session.
 *
 * # Example
 *
 *      var restify = require('restify'),
 *          session = require('restify-session')({
 *              debug : true,
 *              ttl   : 2
 *          });
 *      var server  = restify.createServer();
 *
 *      // attach session manager
 *      server.use(session.sessionManager)
 *
 *      // attach a route
 *      server.get('/', function(req, res, next){
 *         res.send({ success: true, session: req.session });
 *         return next();
 *      });
 *
 *      // start the server
 *      server.listen(3000);
 *
 *      // Save this file as server.js and start it in a terminal window:
 *
 *      $ node server.js
 *
 *      // Open your browser and put the address of your server:
 *
 *      http://localhost:3000
 *
 *      // Now you see an answer like this:
 *
 *      {"success":true,"session":{"sid":"ViS5pHE5n8McblTATbyFUJTGJyzVFeXOcAEZ41Zs"}}
 *
 *      // You can see your session id (sid) into the response header:
 *
 *      Session-Id ViS5pHE5n8McblTATbyFUJTGJyzVFeXOcAEZ41Zs
 *
 * For more information see test/test.js into package folder.
 *
 *
 *
 * # License
 *
 * Copyright (c) 2012 Mitchell Simoens (https://github.com/mitchellsimoens/redis-session)
 *
 * Copyright (c) 2012-2014 Yoovant by Marcello Gesmundo. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *    * Redistributions of source code must retain the above copyright
 *      notice, this list of conditions and the following disclaimer.
 *    * Redistributions in binary form must reproduce the above
 *      copyright notice, this list of conditions and the following
 *      disclaimer in the documentation and/or other materials provided
 *      with the distribution.
 *    * Neither the name of Yoovant nor the names of its
 *      contributors may be used to endorse or promote products derived
 *      from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
module.exports = function(config) {
  // namespace
  var session = {};
  var redis   = require('redis');
  var utils   = require('object_utils');
  var Random  = require('secure-rnd');
  var rnd     = new Random();
  /**
   * @ignore
   * @private
   */
  session.name = 'session';

  /**
   * @ignore
   * @private
   */
  session.merge = utils.merge;

  config = config || {};
  /**
   * Configuration
   */
  session.config = {
    /**
     * @cfg {Integer} ttl=600 The time to live for the session in seconds
     */
    ttl: 600, // 10min
    /**
     * @cfg {Boolean} debug=true true to enable debug session
     */
    debug: false,
    /**
     * @cfg {Object} logger=console The logger. If you use winston set your desired log level and set debug = true.
     */
    logger: console,
    /**
     * @cfg {Integer} sidLength=40 The number of characters to create the session ID.
     */
    sidLength: 40,
    /**
     * @cfg {Boolean} persist=false Persistence of session
     * If persist is false, the session will expire after the ttl config.
     * If persist is true, the session will never expire and ttl config will be ignored.
     */
    persist: false,
    /**
     * @cfg {connection} connection REDIS connection information
     * @cfg {Number} connection.port=6379 REDIS port
     * @cfg {String} connection.host='127.0.0.1' REDIS host
     * @cfg {String} [connection.db] REDIS database
     * @cfg {String} [connection.user] REDIS user
     * @cfg {String} [connection.pass] REDIS password
     */
    connection: {
      port: 6379,
      host: '127.0.0.1',
      db  : undefined,
      user: undefined,
      pass: undefined
    },
    /**
     * @cfg {String} sidHeader='Session-Id' The Header section name to store the session identifier
     */
    sidHeader: 'Session-Id'
  };

  // merge new config with default config
  session.merge(session.config, config);

  if ('function' !== typeof session.config.logger.debug) {
    session.config.logger.debug = session.config.logger.log;
  }
  if ('function' !== typeof session.config.logger.error) {
    session.config.logger.error = session.config.logger.log;
  }
  if ('function' !== typeof session.config.logger.info) {
    session.config.logger.info = session.config.logger.log;
  }

  var cfg = session.config,
      con = cfg.connection;

  // create redis client
  session.client = new redis.createClient(con.port, con.host, con);

  var isNull = utils.isNull;

  if (con.pass && con.pass.length > 0) {
    session.client.auth(con.pass, function(err) {
      if (err) {
        throw err;
      }
    });
  }

  if (con.db) {
    session.client.select(con.db);
    session.client.on('connect', function() {
      session.client.send_anyways = true;
      session.client.select(con.db);
      session.client.send_anyways = false;
    });
  }

  // handle events
  session.client.on('error', function (err) {
    cfg.logger.error(session.name + ': database ERROR');
    cfg.logger.error(err);
  });
  session.client.on('connect', function () {
    cfg.logger.info(session.name + ': connected to Redis database');
  });

  /**
   * Create session identifier
   *
   * @param {Function} callback Function called when the identifier is created
   * @return {callback(err, sid)} The callback to execute as result
   * @param {String} callback.err Error if occurred
   * @param {String} callback.sid session identifier
   * @private
   */
  session.createSid = function(callback) {
    var chars  = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz',
        codes  = [],
        cLen   = chars.length,
        len    = cfg.sidLength,
        sid    = '',
        i      = 0,
        rNum;

    codes.length = cLen;

    // generate secure randoms
    rnd(codes);

    for ( i = 0; i < len; i++) {
      rNum = Math.floor(codes[i] * cLen / 255);
      sid += chars.substring(rNum, rNum + 1);
    }

    session.client.exists(sid, function(err, exists) {
      if (err && cfg.debug) {
        cfg.logger.error(session.name + ': sid creation ERROR');
        cfg.logger.error(err);
      }
      if (exists === 1) {
        session.createSid(callback);
      } else {
        if (cfg.debug) {
          cfg.logger.debug(session.name + ': sid created ' + sid);
        }
        callback.call(session, err, sid);
      }
    });
  };

  /**
   * Save session data
   *
   * @param {String} sid session identifier
   * @param {Object} data session data
   * @param {Function} callback Function called when the session is saved
   * @return {callback(err, status)} The callback to execute as result
   * @param {String} callback.err Error if occurred
   * @param {String} callback.status Result from Redis query
   */
  session.save = function(sid, data, callback) {
    if (isNull(sid)) {
      if (callback) {
        callback.call(session, 'no sid given', undefined);
      }
      return;
    }

    var ttl  = session.config.ttl,
      info = JSON.stringify(data),

      setCallback = function(err, status) {
        if (err && cfg.debug) {
          cfg.logger.error(session.name + ': saving sid ' + sid + ' ERROR');
          cfg.logger.error(err);
        }
        if (callback) {
          callback.call(session, err, status);
        }
      };

    if (cfg.persist) {
      session.client.set(sid, info, setCallback);
    } else {
      session.client.setex(sid, ttl, info, setCallback);
    }
  };

  /**
   * Load session data
   *
   * @param {String} sid session identifier
   * @param {Function} callback Function called when the session is loaded
   * @return {callback(err, data)} The callback to execute as result
   * @param {String} callback.err Error if occurred
   * @param {Object} callback.data session data
   */
  session.load = function(sid, callback) {
    if (isNull(sid)) {
      if (callback) {
        callback.call(session, 'no sid given', undefined);
      }
      return;
    }
    session.client.get(sid, function(err, info) {
      var data;
      if (err) {
        if (cfg.debug) {
          cfg.logger.debug(session.name + ': sid ' + sid + ' loading ERROR');
          cfg.logger.debug(err);
        }
      } else if (!isNull(info)) {
        data = JSON.parse(info.toString());
      }
      if (callback) {
        callback.call(session, err, data);
      }
    });
  };

  /**
   * Update the ttl for the session
   *
   * @param {String} sid session identifier
   * @param {Function} callback Function called when the session is refreshed
   * @return {callback(err, active)} The callback to execute as result
   * @param {String} callback.err Error if occurred
   * @param {Boolean} callback.active True if the sid is active (not expired)
   */
  session.refresh = function(sid, callback) {
    if (isNull(sid)) {
      if (callback) {
        callback.call(session, 'no sid given', false);
      }
      return;
    }
    if (cfg.persist) {
      callback.call(session, undefined, true);
      return;
    }
    session.client.expire(sid, session.config.ttl, function(err, status){
      if (err && cfg.debug) {
        cfg.logger.debug(session.name + ': sid ' + sid + ' refreshing ERROR');
        cfg.logger.debug(err);
      }
      if (callback) {
        callback.call(session, err, (status === 1));
      }
    });
  };

  /**
   * Check if a session identifier exists
   *
   * @param {String} sid session identifier
   * @param {Function} callback Function called when the session identifier is verified
   * @return {callback(err, exists)} The callback to execute as result
   * @param {String} callback.err Error if occurred
   * @param {Boolean} callback.exists Return true if the session exists
   */
  session.exists = function(sid, callback) {
    if (isNull(sid)) {
      callback.call(session, undefined, false);
      return;
    }
    session.client.exists(sid, function(err, status) {
      if (err && cfg.debug) {
        cfg.logger.debug(session.name + ': sid ' + sid + ' does not exist ERROR');
        cfg.logger.debug(err);
      }
      callback.call(session, err, (status === 1) );
    });
  };

  /**
   * Get all session identifier
   *
   * @param {Function} callback Function called when the session identifiers are loaded
   * @return {callback(err, keys)} The callback to execute as result
   * @param {String} callback.err Error if occurred
   * @param {Array} callback.keys All valid session identifiers
   * @private
   */
  session.getAllKeys = function(callback) {
    if (!cfg.debug) {
      cfg.logger.debug(session.name + ': unable to get all session identifiers when not in debug mode');
      if (callback) {
        callback.call(session, 'unable to get all session identifiers when not in debug mode');
      }
      return;
    }
    session.client.keys('*', function(err, keys) {
      if (callback) {
        callback.call(session, err, keys);
      }
    });
  };

  /**
   * Destroy a session
   *
   * @param {String} sid session identifier
   * @param {Function} callback Function called when finishing
   * @return {callback(err, status)} The callback to execute as result
   * @param {String} callback.err Returned error if occurred
   * @param {String} callback.status Returned status code from Redis
   * @private
   */
  session.destroy = function(sid, callback) {
    if (isNull(sid)) {
      if (callback) {
        callback.call(session, 'no sid given', 0);
      }
      return;
    }
    session.client.del(sid, function(status) {
      if (callback) {
        callback.call(session, undefined, status);
      }
    });
  };

  /**
   * Destroy all sessions
   *
   * @param {Function} callback Function called when finishing
   * @return {callback(status)} The callback to execute as result
   * @param {String} callback.err Returned error if occurred
   * @param {String} callback.status Returned status code from Redis
   * @private
   */
  session.destroyAll = function(callback) {
    if (!cfg.debug) {
      cfg.logger.debug(session.name + ': unable to destroy all sessions when not in debug mode');
      if (callback) {
        callback.call(session, 'unable to destroy all sessions when not in debug mode');
      }
      return;
    }
    session.client.flushall(function(status) {
      if (callback) {
        callback.call(session, undefined, status);
      }
    });
  };

  /**
   * Set data in session object to use in other middlewares below this
   *
   * @param {String} sid The session identifier
   * @param {{sid: String, ...}} data The data to store in session
   * @param {{session: data, ...}} req Client request with new __session__ property
   * containing session data
   * @param {Object} res Server response
   * @param {Function} next Calback to execute at the end of saving
   */
  session.setSessionData = function(sid, data, req, res, next) {
    if (isNull(sid)) {
      next();
      return;
    }
    if (isNull(data)) {
      data = {};
    }
    data.sid  = sid;
    session.save(sid, data, function(err, status){
      if (!err) {
        // set session in request to use it in other middlewares
        // attached below this
        req.session = data;
        res.setHeader(cfg.sidHeader, sid);
      }
      next();
    });
  };

  /**
   * Closes the connection to the redis server
   *
   * @param  {Function} callback Callback to execute once connection is closed
   */
  session.disconnect = function (callback) {
    session.client.quit();
    session.client.on('end', callback);
  };

  /**
   * Manage session in http requests
   *
   * @param {Object} req Request from client
   * @param {Object} res Response from server
   * @param {Function} next Next function to execute in server
   */
  session.sessionManager = function (req, res, next) {
    if (cfg.debug) {
      cfg.logger.debug(session.name + ': request url: ' + req.url);
    }
    var reqSid = req.headers[session.config.sidHeader.toLowerCase()];
    session.exists(reqSid, function(existErr, active){
      if (existErr) {
        next();
      } else if (active) {
        // load the session
        session.load(reqSid, function(loadErr, data){
          if (!loadErr) {
            session.setSessionData(reqSid, data, req, res, next);
          } else {
            next();
          }
        });
      } else {
        session.createSid(function(createErr, sid) {
          if (!createErr) {
            session.setSessionData(sid, {}, req, res, next);
          } else {
            next();
          }
        });
      }
    });
  };

  return session;
};
