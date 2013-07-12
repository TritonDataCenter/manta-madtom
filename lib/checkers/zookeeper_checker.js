// Copyright (c) 2013, Joyent, Inc. All rights reserved.

var assert = require('assert-plus');
var Checker = require('checker').Checker;
var net = require('net');
var util = require('util');



///--- Health Checker

function ZookeeperChecker(opts) {
        assert.object(opts, 'opts');
        assert.object(opts.config, 'opts.config');
        assert.object(opts.log, 'opts.log');
        assert.string(opts.config.ip, 'opts.config.ip');
        assert.optionalNumber(opts.config.port, 'opts.config.port');
        assert.optionalNumber(opts.config.timeout, 'opts.config.timeout');

        var self = this;
        self.config = opts.config;
        self.log = opts.log;
}

util.inherits(ZookeeperChecker, Checker);
module.exports = ZookeeperChecker;



///--- Api

ZookeeperChecker.prototype.check = function (cb) {
        var self = this;
        var host = self.config.ip;
        var port = self.config.port || 2181;
        var timeout = self.config.timeout !== undefined ?
                self.config.timeout : 5000;

        var socket = net.createConnection(port, host);
        socket.setTimeout(timeout);

        var error = null;
        var data = null;
        socket.on('connect', function () {
                socket.write('ruok');
        });

        socket.on('data', function (d) {
                data = d.toString();
                socket.end();
        });

        socket.on('end', function () {
        });

        socket.on('close', function () {
                socket.removeAllListeners();
                if (error) {
                        cb(error);
                        return;
                }
                if (data !== 'imok') {
                        error = new Error();
                        error.code = 'DataNotImok';
                }
                cb(error, {
                        'data': data
                });
        });

        socket.on('timeout', function () {
                socket.removeAllListeners();
                socket.destroy();
                error = new Error();
                error.code = 'Timeout';
                error.timeout = self.config.timeout;
                cb(error);
        });

        socket.on('error', function (err) {
                socket.removeAllListeners();
                socket.destroy();
                error = error || err;
                cb(error);
        });
};


ZookeeperChecker.prototype.label = function () {
        return ('zookeeper');
};
