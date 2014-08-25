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
var pg = require('pg');
var util = require('util');



///--- Health Checker

function PostgresChecker(opts) {
        assert.object(opts, 'opts');
        assert.object(opts.config, 'opts.config');
        assert.object(opts.log, 'opts.log');
        assert.string(opts.config.ip, 'opts.config.ip');
        assert.optionalNumber(opts.config.port, 'opts.config.port');
        assert.string(opts.config.username, 'opts.config.username');
        assert.optionalString(opts.config.password, 'opts.config.password');

        var self = this;
        self.config = opts.config;
        self.log = opts.log;
        var url = 'tcp://' + opts.config.username;
        if (opts.config.password) {
                url += ':' + opts.config.password;
        }
        url += '@' + opts.config.ip;
        if (opts.config.port) {
                url += ':' + opts.config.port;
        }
        url += '/postgres';
        self.url = url;
        self.log.info({
                'url': self.url
        }, 'inited pg checker');

}

util.inherits(PostgresChecker, Checker);
module.exports = PostgresChecker;



///--- Api

PostgresChecker.prototype.check = function (cb) {
        var self = this;

        var client = new pg.Client(self.url);
        client.connect(function (err) {
                if (err) {
                        cb(err);
                        return;
                }
                var q = 'SELECT NOW() AS "date"';
                client.query(q, function (err2, result) {
                        client.end();
                        if (err2) {
                                cb(err2);
                                return;
                        }
                        cb(null, {
                                'date': result.rows[0].date
                        });
                });
        });
};


PostgresChecker.prototype.label = function () {
        return ('postgres');
};
