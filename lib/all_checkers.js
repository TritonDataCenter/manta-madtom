/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var MorayChecker = require('./checkers/moray_checker');
var PostgresChecker = require('./checkers/postgres_checker');
var RedisChecker = require('./checkers/redis_checker');
var ZookeeperChecker = require('./checkers/zookeeper_checker');



///--- Functions

var AllCheckers = [
        MorayChecker,
        PostgresChecker,
        RedisChecker,
        ZookeeperChecker
];


///--- API

module.exports = AllCheckers;
