// Copyright (c) 2013, Joyent, Inc. All rights reserved.

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
        var connectTimeout = self.config.connectTimeout || 1000;
        var bucket = self.config.bucket;

        var client = moray.createClient({
                log: self.log,
                connectTimeout: connectTimeout,
                host: host,
                port: port
        });

        var error = null;
        client.once('connect', function () {
                if (bucket) {
                        client.getBucket(bucket, function (err, res) {
                                error = err;
                                client.close();
                        });
                } else {
                        //Odd that we have to send the log here too...
                        var opts = { deep: true, log: self.log };
                        client.ping(opts, function (err) {
                                error = err;
                                client.close();
                        });
                }
        });

        client.once('error', function (err) {
                client.close();
                error = err;
        });

        client.once('close', function (err) {
                client.removeAllListeners();
                cb(error);
        });
};


MorayChecker.prototype.label = function () {
        return ('moray');
};
