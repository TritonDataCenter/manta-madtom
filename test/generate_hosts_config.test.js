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
var fs = require('fs');
var path = require('path');
var vasync = require('vasync');

/*
 * etc/config.json is the expected location for the madtom
 * configuration file.
 */
var config_file = 'etc/config.json';
var host_config_file = '/var/tmp/madtom-hosts.json';
var target_path = path.join(__dirname, '..', 'bin', 'generate_hosts_config.js');

var executed;
var failed;

/*
 * This code tests the total/end functionality of the command line
 * creation of the generation hosts configuration file in cases where
 * error messaging can be checked by exact matches.
 */

var cases = [ {
        'name': 'testing w/ correct flags & args',
        'argv': ['-c', config_file, '-f', host_config_file ],
        'error': null
}, {
        'name': 'testing w/ -c & -f order flipped',
        'argv': ['-f', host_config_file, '-c', config_file ],
        'error': null
}, {
        'name': 'testing w/ -f noargs',
        'argv': ['-f'],
        'error': 'Command failed: option requires an argument -- f\n' +
            'Error while reading/parsing config file: ENOENT\n' +
            'usage: generate_hosts_config.js [-a agentNetworkTag] ' +
            '[-c configFile] [-f output_file] [-n mantaNetworkTag]\n'
}, {
        'name': 'testing w/ -f only',
        'argv': ['-f', host_config_file ],
        'error': 'Command failed: Error while reading/parsing config ' +
            'file: ENOENT\n' +
            'usage: generate_hosts_config.js [-a agentNetworkTag] ' +
            '[-c configFile] [-f output_file] [-n mantaNetworkTag]\n'
}, {
        'name': 'testing w/ -c & -f noargs',
        'argv': ['-c', '-f'],
        'error': 'Command failed: Error while reading/parsing ' +
            'config file: ENOENT\n' +
            'usage: generate_hosts_config.js [-a agentNetworkTag] ' +
            '[-c configFile] [-f output_file] [-n mantaNetworkTag]\n'
}, {
        'name': 'testing w/ -c & -f wrong args',
        'argv': ['-c', host_config_file, '-f', config_file ],
        'error': 'Command failed: Error while reading/parsing ' +
            'config file: ENOENT\n' +
            'usage: generate_hosts_config.js [-a agentNetworkTag] ' +
            '[-c configFile] [-f output_file] [-n mantaNetworkTag]\n'
} ];

function main() {
        executed = 0;
        failed = 0;

        assertplus.string(config_file);
        if (!fs.existsSync(config_file)) {
                console.log('tests for %s could not be run, since the' +
                    'configuration file needed at %s is missing',
                    target_path, config_file);
                process.exit(1);
        }

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
 * This function tests if running the generate host config
 * script actually created the file, or threw the expected
 * error in the case that incorrect or disordered arguments
 * were passed to the command in the test case.
 */
function runTestCases(c, cb) {
        assertplus.string(target_path);
        assertplus.string(host_config_file);
        assertplus.object(c);
        assertplus.string(c['name']);
        assertplus.arrayOfString(c['argv']);

        /*
         * In order to test successful creation of the config
         * file, we can't leave the file created from old tests
         * lying around after each test run.
         */
        if (fs.existsSync(host_config_file)) {
                fs.unlinkSync(host_config_file);
                console.log('Cleaning up: deleted ' + host_config_file +
                    ' left over from previous testing.');
        }

        child.execFile(target_path, c['argv'], function
            (error, stdout, stderr) {
                if (error && (c['error'] !== error.message)) {
                        console.log('* TEST CASE ' + c['name'] +
                            ' failed with unexpected error:\n',
                            error.message);
                        failed++;
                }
                if (!error && (c['error'] !== null)) {
                        console.log('* TEST CASE ' + c['name'] +
                            ' should have failed with error:\n' +
                            c['error']);
                        failed++;
                }
                executed++;
                cb();
        });
}

main();