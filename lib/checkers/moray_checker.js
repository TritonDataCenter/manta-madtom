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
var moray = require('moray');
var util = require('util');



///--- Health Checker

function MorayChecker(opts) {
        assert.object(opts, 'opts');
        assert.object(opts.config, 'opts.config');
        assert.object(opts.log, 'opts.log');
        assert.string(opts.config.ip, 'opts.config.ip');
        assert.optionalNumber(opts.config.port, 'opts.config.port');
        assert.optionalNumber(opts.config.connectTimeout,
                              'opts.config.connectTimeout');
        assert.optionalString(opts.config.bucket, 'opts.config.bucket');

        var self = this;
        self.config = opts.config;
        self.log = opts.log;
        self.log.info({
                'ip': self.config.ip,
                'port': self.config.port
        });
}

util.inherits(MorayChecker, Checker);
module.exports = MorayChecker;



///--- Api

MorayChecker.prototype.check = function (cb) {
        var self = this;

        var host = self.config.ip;
        var port = self.config.port || 2020;
        var connectTimeout = self.config.connectTimeout || 5000;
        var bucket = self.config.bucket;
        var error = null;
        var ended = false;
        var timeoutId;

        function end() {
                if (!ended) {
                        ended = true;
                        cb(error);
                }
        }

        var client = moray.createClient({
                log: self.log,
                host: host,
                port: port,
                maxConnections: 1,
                retry: {
                        maxTimeout: self.config.connectTimeout,
                        retries: 1
                }
        });

        client.once('connect', function () {
                if (bucket) {
                        client.getBucket(bucket, function (err, res) {
                                clearTimeout(timeoutId);
                                error = err;
                                client.close();
                        });
                } else {
                        //Odd that we have to send the log here too...
                        var opts = { deep: true, log: self.log };
                        client.ping(opts, function (err) {
                                clearTimeout(timeoutId);
                                error = err;
                                client.close();
                        });
                }
        });

        client.once('error', function (err) {
                error = err;
                try {
                        client.close();
                } catch (e) {
                        error = e;
                }
                end();
        });

        client.once('close', function (err) {
                end();
        });

        function onTimeout() {
                error = new Error();
                error.code = 'Timeout';
                error.timeout = connectTimeout;
                try {
                        client.close();
                } catch (e) {
                        error = e;
                }
                end();
        }
        timeoutId = setTimeout(onTimeout, connectTimeout);
};


MorayChecker.prototype.label = function () {
        return ('moray');
};
