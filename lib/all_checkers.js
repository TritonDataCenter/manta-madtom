// Copyright (c) 2013, Joyent, Inc. All rights reserved.

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
