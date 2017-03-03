/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

var assertplus = require('assert-plus');
var child = require('child_process');
var path = require('path');
var vasync = require('vasync');

var node_path = path.join(__dirname, '..', 'build', 'node', 'bin', 'node');
var target_path = path.join(__dirname, '..', 'server.js');

var executed;
var failed;

var cases = [ {
        'name': 'testing w/ -c no args',
        'argv': [target_path, '-c'],
        'error': 'Command failed: option requires an argument -- c\n' +
            'No config files specified.\n' +
            'usage: server.js [-c config_file] [-p port]\n'
}, {
        'name': 'testing w/ no flags',
        'argv': [target_path],
        'error': 'Command failed: No config files specified.\n' +
            'usage: server.js [-c config_file] [-p port]\n'
} ];

function main() {
        executed = 0;
        failed = 0;

        vasync.forEachPipeline({
                'func': runTestCases,
                'inputs': cases
        }, function (err) {
                if (err) {
                        console.error('test failed with error: ', err);
                }
        });

        process.on('exit', function () {
                assertplus.equal(executed, cases.length);
                console.log('%d case(s) executed, %d case(s) failed',
                    executed, failed);
                if (failed > 0) {
                        process.exit(1);
                }
        });
}

/*
 * This function tests if the expected error messages are thrown
 * when incorrect or missing arguments are passed to the server
 * run command in the test cases.
 */
function runTestCases(c, cb) {
        assertplus.string(node_path);
        assertplus.object(c);
        assertplus.string(c['name']);
        assertplus.arrayOfString(c['argv']);
        assertplus.string(c['error']);

        child.execFile(node_path, c['argv'], function
            (error, stdout, stderr) {
                if (error && (c['error'] !== error.message)) {
                        console.error('* TEST CASE ' + c['name'] +
                            ' failed with unexpected error:\n',
                             error.message);
                        failed++;
                }
                if (!error && (c['error'] !== null)) {
                        console.error('* TEST CASE ' + c['name'] +
                            ' should have failed with error:\n' +
                            c['error']);
                        failed++;
                }
                executed++;
                cb();
        });
}


main();