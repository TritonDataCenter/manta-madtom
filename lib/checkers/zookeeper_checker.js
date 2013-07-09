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
        var error = null;
        var object = null;

        var opts = {
                'host': host,
                'port': port
        }

        var error = null;
        var data = null;
        var client = net.connect(opts, function () {
                client.write('ruok');
        });
        client.setTimeout(5000);

        client.on('data', function (d) {
                data = d.toString();
                client.end();
        });

        client.on('timeout', function () {
                error = new Error('socket timed out');
                client.end();
        });

        client.on('error', function (err) {
                error = err;
                client.end();
        });

        client.on('end', function() {
        });

        client.on('close', function () {
                client.removeAllListeners();
                if (error) {
                        cb(error);
                        return;
                }
                if (data !== 'imok') {
                        error = new Error('data !== imok');
                }
                cb(error, {
                        'data': data
                });
        });
};


ZookeeperChecker.prototype.label = function () {
        return ('zookeeper');
};
