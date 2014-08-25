/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var assert = require('assert-plus');
var Checker = require('checker').Checker;
var redis = require('redis');
var util = require('util');



///--- Health Checker

function RedisChecker(opts) {
        assert.object(opts, 'opts');
        assert.object(opts.config, 'opts.config');
        assert.object(opts.log, 'opts.log');
        assert.string(opts.config.ip, 'opts.config.ip');
        assert.optionalNumber(opts.config.port, 'opts.config.port');

        var self = this;
        self.config = opts.config;
        self.log = opts.log;
        self.log.info({
                ip: self.config.ip,
                port: self.config.port
        }, 'inited redis checker');
}

util.inherits(RedisChecker, Checker);
module.exports = RedisChecker;



///--- Api

RedisChecker.prototype.check = function (cb) {
        var self = this;

        var host = self.config.ip;
        var port = self.config.port || 6379;
        var connectTimeout = self.config.connectTimeout || 5000;

        var client = redis.createClient(port, host);

        //We have to leave event listeners on the client so that we get the
        // socket error when we time out, otherwise it becomes an uncaught
        // exception and our node app blows sky high.  So we keep track if we've
        // timed out and do nothing in 'error' if so.
        var timedOut = false;
        var timeoutId;

        function onConnectTimeout() {
                timedOut = true;
                var error = new Error();
                error.code = 'Timeout';
                error.timeout = connectTimeout;
                cb(error);
        }

        client.once('error', function (err) {
                client.removeAllListeners();
                client.end();
                //See above...
                if (timedOut) {
                        return;
                }
                clearTimeout(timeoutId);
                cb(err);
        });

        client.once('ready', function () {
                client.removeAllListeners();
                clearTimeout(timeoutId);

                //See Above...
                if (timedOut) {
                        client.quit();
                        return;
                }

                client.info(function (err, replies) {
                        //See Above...
                        if (timedOut) {
                                client.quit();
                                return;
                        }

                        if (err) {
                                cb(err);
                                return;
                        }
                        var parts = replies.split('\r\n');
                        var r = {};
                        for (var i = 0; i < parts.length; ++i) {
                                var kv = parts[i].split(':');
                                r[kv[0]] = kv[1];
                        }
                        //Only take a subset of what come back...
                        cb(null, {
                                'processId': r['process_id'],
                                'connectedClients': r['connectedClients'],
                                'usedMemoryHuman': r['used_memory_human'],
                                'used_memory_peak_human':
                                        r['used_memory_peak_human']
                        });
                        client.quit();
                });
        });

        timeoutId = setTimeout(onConnectTimeout, connectTimeout);
};


RedisChecker.prototype.label = function () {
        return ('redis');
};
