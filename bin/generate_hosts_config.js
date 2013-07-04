#!/usr/bin/env node
// -*- mode: js -*-
// Copyright 2012 Joyent, Inc.  All rights reserved.

var assert = require('assert-plus');
var bunyan = require('bunyan');
var dns = require('native-dns');
var getopt = require('posix-getopt');
var path = require('path');
var sdc = require('sdc-clients');
var vasync = require('vasync');

var LOG = bunyan.createLogger({
        'level': (process.env.LOG_LEVEL || 'info'),
        'name': 'generate_hosts_config',
        'stream': process.stdout,
        'serializers': bunyan.stdSerializers
});



//--- Helpers

function usage(msg) {
        if (msg) {
                console.error(msg);
        }
        var str  = 'usage: ' + path.basename(process.argv[1]);
        str += ' [-d datacenter:dns_ip]';
        console.error(str);
        process.exit(1);
}

function parseOptions() {
        var option;
        var opts = {
                'dc': {}
        };
        var parser = new getopt.BasicParser('d:',
                                            process.argv);
        while ((option = parser.getopt()) !== undefined && !option.error) {
                switch (option.option) {
                case 'd':
                        var o = option.optarg;
                        var parts = o.split(':');
                        if (o.indexOf(':') === -1 || parts.length !== 2) {
                                usage('Invalid datacenter:dns_ip pair: ' + o);
                        }
                        var dc = parts[0];
                        var dnsIp = parts[1];
                        opts.dc[dc] = {};
                        opts.dc[dc]['DNS'] = dnsIp;
                        break;
                default:
                        usage('Unknown option: ' + option.option);
                        break;
                }
        }

        if (Object.keys(opts.dc).length === 0) {
                usage('-d [datacenter:dns_ip] is a required argument.');
        }

        return (opts);
}


function lookup(opts, cb) {
        assert.string(opts.domainName, 'opts.domainName');
        assert.string(opts.ip, 'opts.ip');
        assert.optionalNumber(opts.port, 'opts.port');

        var host = opts.ip;
        var port = opts.port || 53;
        var domainName = opts.domainName;

        var question = dns.Question({
                name: domainName,
                type: 'A'
        });

        var req = dns.Request({
                question: question,
                server: { address: host, port: port, type: 'udp' },
                timeout: 1000,
                cache: false
        });

        var error;
        var answers = [];
        req.on('timeout', function () {
                error = new Error('timed out');
        });

        req.on('message', function (err, answer) {
                if (err) {
                        error = err;
                        return;
                }
                answer.answer.forEach(function (a) {
                        answers.push(a.address);
                });
        });

        req.on('end', function () {
                if (error) {
                        cb(error);
                        return;
                }
                //We could randomly return an answer...
                cb(null, answers[0]);
        });

        req.send();
}


function getClients(opts, cb) {
        var self = this;
        var clients = {};

        function hn(svc) {
                return (svc + '.' + opts.dc + '.joyent.us');
        }

        function url(ip) {
                return ('http://' + ip);
        }

        vasync.pipeline({
                'funcs': [
                        function sapi(_, subcb) {
                                var o = {
                                        'ip': opts.dns,
                                        'domainName': hn('sapi')
                                };
                                lookup(o, function (err, a) {
                                        if (err) {
                                                subcb(err);
                                                return;
                                        }
                                        clients['SAPI'] = new sdc.SAPI({
                                                log: self.log,
                                                url: url(a),
                                                agent: false
                                        });
                                        subcb();
                                });
                        },
                        function cnapi(_, subcb) {
                                var o = {
                                        'ip': opts.dns,
                                        'domainName': hn('cnapi')
                                };
                                lookup(o, function (err, a) {
                                        if (err) {
                                                subcb(err);
                                                return;
                                        }
                                        clients['CNAPI'] = new sdc.CNAPI({
                                                log: self.log,
                                                url: url(a),
                                                agent: false
                                        });
                                        subcb();
                                });
                        },
                        function vmapi(_, subcb) {
                                var o = {
                                        'ip': opts.dns,
                                        'domainName': hn('vmapi')
                                };
                                lookup(o, function (err, a) {
                                        if (err) {
                                                subcb(err);
                                                return;
                                        }
                                        clients['VMAPI'] = new sdc.VMAPI({
                                                log: self.log,
                                                url: url(a),
                                                agent: false
                                        });
                                        subcb();
                                });
                        },
                        function ufds(_, subcb) {
                                var o = {
                                        'ip': opts.dns,
                                        'domainName': hn('ufds')
                                };
                                lookup(o, function (err, a) {
                                        if (err) {
                                                subcb(err);
                                                return;
                                        }
                                        var u = 'ldaps://' + a;
                                        clients['UFDS'] = new sdc.UFDS({
                                                url: u,
                                                bindDN: 'cn=root',
                                                bindPassword: 'secret',
                                                cache: {
                                                        size: 1000,
                                                        expiry: 300
                                                }
                                        });
                                        clients['UFDS'].on('ready', subcb);
                                });
                        }
                ]
        }, function (err) {
                cb(err, clients);
        });
}


function setupSdcClients(_, cb) {
        var self = this;
        var dcs = Object.keys(self.DC);
        var i = 0;
        function setupNextClient() {
                var dc = dcs[i];
                if (dc === undefined) {
                        cb();
                        return;
                }
                var opts = {
                        'dc': dc,
                        'dns': self.DC[dc].DNS
                };
                getClients.call(self, opts, function (err, clients) {
                        if (err) {
                                cb(err);
                                return;
                        }
                        self.DC[dc]['CLIENT'] = clients;
                        ++i;
                        setupNextClient();
                });
        }
        setupNextClient();
}


function findVm(instance, cb) {
        var self = this;
        var uuid = instance.uuid;
        if (instance.metadata && instance.metadata.DATACENTER) {
                var dc = instance.metadata.DATACENTER;
                var vmapi = self.DC[dc].CLIENT.VMAPI;
                vmapi.getVm({ uuid: uuid }, cb);
                return;
        } else {
                var dcs = Object.keys(self.DC);
                vasync.forEachParallel({
                        'inputs': dcs.map(function (d) {
                                return (self.DC[d].CLIENT.VMAPI);
                        }),
                        'func': function (client, subcb) {
                                client.getVm({ uuid: uuid }, subcb);
                        }
                }, function (err, results) {
                        if (results.successes.length < 1) {
                                cb(new Error('unable to get VM for ' + uuid));
                                return;
                        }
                        cb(null, results.successes[0]);
                });
        }
}


function findServer(server, cb) {
        var self = this;
        var dcs = Object.keys(self.DC);
        vasync.forEachParallel({
                'inputs': dcs.map(function (dc) {
                        return (self.DC[dc].CLIENT.CNAPI);
                }),
                'func': function (client, subcb) {
                        client.getServer(server, subcb);
                }
        }, function (err, results) {
                if (results.successes.length < 1) {
                        cb(new Error('unable to get server for ' + server));
                        return;
                }
                cb(null, results.successes[0]);
        });
}



//--- Main

var _self = this;
_self.log = LOG;
var _opts = parseOptions();
_self['DC'] = _opts.dc;
var fdc = Object.keys(_self['DC'])[0];

vasync.pipeline({
        'funcs': [
                setupSdcClients.bind(_self),
                function lookupPoseidon(_, subcb) {
                        //Choose a random one, it doesn't matter
                        var ufds = _self.DC[fdc].CLIENT.UFDS;
                        ufds.getUser('poseidon', function (err, user) {
                                if (err) {
                                        subcb(err);
                                        return;
                                }
                                _self['POSEIDON'] = user;
                                _self.log.debug({
                                        'uuid': _self['POSEIDON'].uuid
                                }, 'found poseidon');
                                subcb();
                        });
                },
                function lookupMantaApplication(_, subcb) {
                        //Choose a random one, it doesn't matter
                        var sapi = _self.DC[fdc].CLIENT.SAPI;
                        var search = {
                                'name': 'manta',
                                'owner_uuid':  _self['POSEIDON'].uuid,
                                'include_master': true
                        };
                        sapi.listApplications(search, function (err, apps) {
                                if (err) {
                                        subcb(err);
                                        return;
                                }
                                if (apps.length < 1) {
                                        subcb(new Error('unable to find the ' +
                                                        'manta applcation'));
                                        return;
                                }
                                _self['MANTA'] = apps[0];
                                _self.log.debug({
                                        'manta': _self['MANTA'].uuid
                                }, 'found the manta application');
                                subcb();
                        });
                },
                function lookupInstances(_, subcb) {
                        var sapi = _self.DC[fdc].CLIENT.SAPI;

                        function onResults(err, objs) {
                                if (err) {
                                        subcb(err);
                                        return;
                                }

                                _self['SAPI_INSTANCES'] = {};
                                var svcs = Object.keys(objs.instances);
                                for (var i = 0; i < svcs.length; ++i) {
                                        var svc_uuid = svcs[i];
                                        var ins = objs.instances[svc_uuid];
                                        for (var j = 0; j < ins.length; ++j) {
                                                var o = ins[j];
                                                var k = o.uuid;
                                                _self['SAPI_INSTANCES'][k] = o;
                                        }
                                }
                                _self.log.debug({
                                        'instances': Object.keys(
                                                _self['SAPI_INSTANCES']).sort()
                                }, 'found sapi instances');
                                subcb();
                        }

                        sapi.getApplicationObjects(_self.MANTA.uuid, onResults);
                },
                function lookupVms(_, subcb) {
                        var inputs = Object.keys(_self['SAPI_INSTANCES']).map(
                                function (k) {
                                        return (_self['SAPI_INSTANCES'][k]);
                                });
                        vasync.forEachParallel({
                                'inputs': inputs,
                                'func': findVm.bind(_self)
                        }, function (err, results) {
                                if (err) {
                                        subcb(err);
                                        return;
                                }
                                _self['VMAPI_VMS'] = {};
                                var opers = results.operations;
                                for (var i = 0; i < opers.length; ++i) {
                                        var uuid = inputs[i].uuid;
                                        var res = opers[i].result;
                                        _self['VMAPI_VMS'][uuid] = res;
                                }
                                _self.log.debug({
                                        'vms': Object.keys(
                                                _self['VMAPI_VMS']).sort()
                                }, 'found vmapi vms');
                                subcb();
                        });
                },
                function lookupServers(_, subcb) {
                        var servers = [];
                        var vms = Object.keys(_self['VMAPI_VMS']);
                        for (var i = 0; i < vms.length; ++i) {
                                var vm = _self['VMAPI_VMS'][vms[i]];
                                var server = vm.server_uuid;
                                if (servers.indexOf(server) === -1) {
                                        servers.push(server);
                                }
                        }
                        vasync.forEachParallel({
                                'inputs': servers,
                                'func': findServer.bind(_self)
                        }, function (err, results) {
                                if (err) {
                                        subcb(err);
                                        return;
                                }
                                var opers = results.operations;
                                _self['CNAPI_SERVERS'] = {};
                                for (var j = 0; i < opers.length; ++j) {
                                        var uuid = servers[j];
                                        var res = opers[j].result;
                                        _self['CNAPI_SERVERS'][uuid] = res;
                                }
                                _self.log.debug({
                                        'servers': Object.keys(
                                                _self['CNAPI_SERVERS']).sort()
                                }, 'found cnapi servers');
                                subcb();
                        });
                },
                function gatherHosts(_, subcb) {
                        var instances = Object.keys(_self['SAPI_INSTANCES']);
                        var agents = [];
                        _self['HOSTS'] = [];

                        //First the regular applications...
                        for (var i = 0; i < instances.length; ++i) {
                                var uuid = instances[i];
                                var vm = _self['VMAPI_VMS'][uuid];
                                var server_uuid = vm.server_uuid;
                                var sv = _self['CNAPI_SERVERS'][server_uuid];
                                //Save compute servers for agents...
                                if (vm.tags &&
                                    vm.tags.manta_role === 'compute') {
                                        if (agents.indexOf(server_uuid) ===
                                            -1) {
                                                agents.push(server_uuid);
                                        }
                                        continue;
                                }
                                //Not something we're interested in...
                                if (!vm.tags ||
                                    !vm.tags.manta_role ||
                                    vm.tags.manta_role === 'madtom') {
                                        continue;
                                }

                                var nics = vm.nics;
                                var ip = null;
                                for (var j = 0; j < nics.length; ++j) {
                                        var nic = nics[j];
                                        //TODO: Is this always correct?
                                        if (nic.nic_tag === 'admin') {
                                                ip = nic.ip;
                                                break;
                                        }
                                }

                                //Finally build the host struct...
                                _self['HOSTS'].push({
                                        'hostType': vm.tags.manta_role,
                                        'ip': ip,
                                        'uuid': uuid,
                                        'datacenter': sv.datacenter,
                                        'server': server_uuid
                                });
                        }

                        //Now the marlin agents...
                        for (i = 0; i < agents.length; ++i) {
                                server_uuid = agents[i];
                                sv = _self['CNAPI_SERVERS'][server_uuid];
                                ip = null;
                                nics = sv.sysinfo['Network Interfaces'];
                                var nns = Object.keys(nics);
                                for (j = 0; j < nns.length; ++j) {
                                        var nn = nns[j];
                                        nic = nics[nn];
                                        if (nic['NIC Names'].indexOf('admin')
                                            !== -1) {
                                                ip = nic['ip4addr'];
                                                break;
                                        }
                                }
                                _self['HOSTS'].push({
                                        'hostType': 'agent',
                                        'ip': ip,
                                        'uuid': server_uuid,
                                        'datacenter': sv.datacenter,
                                        'server': server_uuid
                                });
                        }
                        subcb();
                }
        ]
}, function (err) {
        if (err) {
                _self.log.fatal(err);
                process.exit(1);
        }

        //Ok, now output hosts...
        console.log(JSON.stringify({
                hosts: _self['HOSTS']
        }, null, 2));
        _self.log.debug('Done.');
        process.exit(0);
});
