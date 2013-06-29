// Copyright (c) 2013, Joyent, Inc. All rights reserved.

var assert = require('assert-plus');
var zkplus = require('zkplus');



///--- Health Checker

function ZookeeperChecker(opts) {
        assert.object(opts, 'opts');
        assert.object(opts.config, 'opts.config');
        assert.object(opts.log, 'opts.log');
        assert.string(opts.config.ip, 'opts.config.ip');
        assert.string(opts.config.path, 'opts.config.path');
        assert.optionalNumber(opts.config.port, 'opts.config.port');

        var self = this;
        self.config = opts.config;
        self.log = opts.log;
}

module.exports = ZookeeperChecker;



///--- Api

ZookeeperChecker.prototype.check = function (cb) {
        var self = this;
        var host = self.config.ip;
        var port = self.config.port || 2181;
        var path = self.config.path;
        var error = null;
        var object = null;

        var client = zkplus.createClient({
                servers: [
                        {
                                host: host,
                                port: port
                        }
                ]
        });

        client.on('connect', function () {
                client.get(path, function (err, obj) {
                        obj = object;
                        client.close();
                });
        });


        client.on('error', function (err) {
                client.removeAllListeners();
                client.close();
        });

        client.on('close', function () {
                client.removeAllListeners();
                if (error) {
                        cb(error);
                        return;
                }
                cb(null, {
                        'object': object
                });
        });

        client.connect();
};
