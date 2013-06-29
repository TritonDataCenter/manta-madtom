// Copyright (c) 2013, Joyent, Inc. All rights reserved.

var assert = require('assert-plus');
var redis = require('redis');



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

module.exports = RedisChecker;



///--- Api

RedisChecker.prototype.check = function (cb) {
        var self = this;

        var host = self.config.ip;
        var port = self.config.port || 6379;
        var connectTimeout = self.config.connectTimeout || 1000;

        var client = redis.createClient(port, host);
        var timeoutId;

        function onConnectTimeout() {
                client.removeAllListeners();
                cb(new Error('connect timeout', connectTimeout));
        }

        client.once('error', function (err) {
                client.removeAllListeners();
                cb(err);
        });

        client.once('ready', function () {
                client.removeAllListeners();
                clearTimeout(timeoutId);

                client.info(function (err, replies) {
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
