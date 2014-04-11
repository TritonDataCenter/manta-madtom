#!/usr/bin/env node
// -*- mode: js -*-
// Copyright 2012 Joyent, Inc.  All rights reserved.

var assert = require('assert-plus');
var bunyan = require('bunyan');
var dns = require('native-dns');
var fs = require('fs');
var getopt = require('posix-getopt');
var path = require('path');
var sdc = require('sdc-clients');
var vasync = require('vasync');

var LOG = bunyan.createLogger({
        'level': (process.env.LOG_LEVEL || 'debug'),
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
        str += ' [-a agentNetworkTag]';
        str += ' [-c configFile]';
        str += ' [-d datacenter:dns_ip]';
        str += ' [-f output_file]';
        str += ' [-n mantaNetworkTag]';
        console.error(str);
        process.exit(1);
}

function parseOptions() {
        var option;
        var opts = {
                'dcs': {}
        };
        var parser = new getopt.BasicParser('a:c:d:f:n:',
                                            process.argv);
        while ((option = parser.getopt()) !== undefined && !option.error) {
                switch (option.option) {
                case 'a':
                        opts.agentNetworkTag = option.optarg;
                        break;
                case 'c':
                        opts.configFile = option.optarg;
                        break;
                case 'd':
                        var o = option.optarg;
                        var parts = o.split(':');
                        if (o.indexOf(':') === -1 || parts.length !== 2) {
                                usage('Invalid datacenter:dns_ip pair: ' + o);
                        }
                        var dc = parts[0];
                        var dnsIp = parts[1];
                        opts.dcs[dc] = {};
                        opts.dcs[dc]['DNS'] = dnsIp;
                        break;
                case 'f':
                        opts.outputFileName = option.optarg;
                        break;
                case 'n':
                        opts.networkTag = option.optarg;
                        break;
                default:
                        usage('Unknown option: ' + option.option);
                        break;
                }
        }

        if (!opts.configFile) {
                usage('-c [config_file] is a required argument');
        }

        //Load config file and pull what we need out of it...
        try {
                var contents = fs.readFileSync(opts.configFile, 'utf-8');
                var config = JSON.parse(contents);
        } catch (e) {
                usage('Error while reading/parsing config file: ' + e.code);
        }

        if (!config.ufds) {
                usage('Config file didn\'t contain a ufds block.');
        }
        opts.ufdsConfig = config.ufds;

        if (!config.dns_domain) {
                usage('Config file didn\'t contain a dns_domain.');
        }
        opts.dnsDomain = config.dns_domain;

        if (!config.datacenter) {
                usage('Config file didn\'t contain a datacenter.');
        }
        opts.datacenter = config.datacenter;

        // Now look at the other parameters

        if (!opts.outputFileName) {
                usage('-f [output_file] is a required argument');
        }

        if (Object.keys(opts.dcs).length === 0) {
                usage('-d [datacenter:dns_ip] is a required argument.');
        }

        if (Object.keys(opts.dcs).indexOf(opts.datacenter) === -1) {
                usage('datacenter ' + opts.datacenter +
                      ' not found in list of dcs: ' + Object.keys(opts.dcs));
        }

        //Servers don't have an ip4addr for the nic tagged with 'manta', so
        // we default 'admin' here.
        opts.agentNetworkTag = opts.agentNetworkTag || 'admin';
        opts.networkTag = opts.networkTag || 'manta';

        return (opts);
}


function lookup(opts, cb) {
        assert.string(opts.domainName, 'opts.domainName');
        assert.string(opts.ip, 'opts.ip');
        assert.optionalNumber(opts.port, 'opts.port');

        var self = this;

        var host = opts.ip;
        var port = opts.port || 53;
        var domainName = opts.domainName;

        self.log.debug({
                'host': host,
                'port': port,
                'domainName': domainName
        }, 'dns lookup');

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
                self.log.debug({
                        'host': host,
                        'port': port,
                        'domainName': domainName,
                        'answer': answers[0]
                }, 'dns lookup complete');

                //We could randomly return an answer...
                cb(null, answers[0]);
        });

        req.send();
}


function getClients(opts, cb) {
        var self = this;
        var clients = {};

        function hn(svc) {
                return (svc + '.' + opts.dc + '.' + opts.dnsDomain);
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
                                lookup.call(self, o, function (err, a) {
                                        if (err) {
                                                subcb(err);
                                                return;
                                        }
                                        clients['SAPI'] = new sdc.SAPI({
                                                log: self.log,
                                                url: url(a),
                                                agent: false
                                        });
                                        self.log.debug({
                                                'client': 'sapi',
                                                'dns': opts.dns,
                                                'dc': opts.dc,
                                                'url': url(a)
                                        });
                                        subcb();
                                });
                        },
                        function cnapi(_, subcb) {
                                var o = {
                                        'ip': opts.dns,
                                        'domainName': hn('cnapi')
                                };
                                lookup.call(self, o, function (err, a) {
                                        if (err) {
                                                subcb(err);
                                                return;
                                        }
                                        clients['CNAPI'] = new sdc.CNAPI({
                                                log: self.log,
                                                url: url(a),
                                                agent: false
                                        });
                                        self.log.debug({
                                                'client': 'cnapi',
                                                'dns': opts.dns,
                                                'dc': opts.dc,
                                                'url': url(a)
                                        });
                                        subcb();
                                });
                        },
                        function vmapi(_, subcb) {
                                var o = {
                                        'ip': opts.dns,
                                        'domainName': hn('vmapi')
                                };
                                lookup.call(self, o, function (err, a) {
                                        if (err) {
                                                subcb(err);
                                                return;
                                        }
                                        clients['VMAPI'] = new sdc.VMAPI({
                                                log: self.log,
                                                url: url(a),
                                                agent: false
                                        });
                                        self.log.debug({
                                                'client': 'vmapi',
                                                'dns': opts.dns,
                                                'dc': opts.dc,
                                                'url': url(a)
                                        });
                                        subcb();
                                });
                        },
                        function ufds(_, subcb) {
                                //Only init ufds in the local dc...
                                if (opts.dc !== self['DATACENTER']) {
                                        self.log.debug({
                                                'client': 'ufds',
                                                'dc': opts.dc,
                                                'datacenter': self['datacenter']
                                        }, 'not initing ufds, not in local dc');
                                        subcb();
                                        return;
                                }

                                self.log.debug({
                                        'ufdsConfig': opts.ufdsConfig
                                }, 'connecting to ufds');

                                clients['UFDS'] = new sdc.UFDS(opts.ufdsConfig);

                                function oc(err2) {
                                        self.log.debug({
                                                'ufdsConfig': opts.ufdsConfig,
                                                'err': err2
                                        }, 'ufds onReady');
                                        subcb(err2);
                                }

                                clients['UFDS'].on('ready', oc);
                        }
                ]
        }, function (err) {
                cb(err, clients);
        });
}


function setupSdcClients(_, cb) {
        var self = this;
        var dcs = Object.keys(self.DCS);
        var i = 0;
        function setupNextClient() {
                var dc = dcs[i];
                if (dc === undefined) {
                        cb();
                        return;
                }
                var opts = {
                        'dc': dc,
                        'dns': self.DCS[dc].DNS,
                        'dnsDomain': self.DNS_DOMAIN,
                        'ufdsConfig': self.UFDS_CONFIG
                };
                getClients.call(self, opts, function (err, clients) {
                        if (err) {
                                cb(err);
                                return;
                        }
                        self.DCS[dc]['CLIENT'] = clients;
                        ++i;
                        setupNextClient();
                });
        }
        setupNextClient();
}


function findVm(instance, cb) {
        var self = this;
        var uuid = instance.uuid;
        if (!instance.metadata || !instance.metadata.DATACENTER) {
                self.log.error({
                        'instance': instance
                }, 'instance has no DATACENTER');
                return (cb(new Error('instance has no DATACENTER: ' + uuid)));
        }
        var dc = instance.metadata.DATACENTER;
        var vmapi = self.DCS[dc].CLIENT.VMAPI;
        return (vmapi.getVm({ uuid: uuid }, cb));
}


function findServer(server, cb) {
        var self = this;
        var dcs = Object.keys(self.DCS);
        vasync.forEachParallel({
                'inputs': dcs.map(function (dc) {
                        return (self.DCS[dc].CLIENT.CNAPI);
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
_self['DCS'] = _opts.dcs;
_self['OUTPUT_FILENAME'] = _opts.outputFileName;
_self['DATACENTER'] = _opts.datacenter;
_self['DNS_DOMAIN'] = _opts.dnsDomain;
_self['NETWORK_TAG'] = _opts.networkTag;
_self['AGENT_NETWORK_TAG'] = _opts.agentNetworkTag;
_self['UFDS_CONFIG'] = _opts.ufdsConfig;


_self.log.debug({
        'dcs': _self['DCS'],
        'outputFile': _self['OUTPUT_FILENAME'],
        'datacenter': _self['DATACENTER'],
        'dnsDomain': _self['DNS_DOMAIN'],
        'networkTag': _self['NETWORK_TAG'],
        'agentNetworkTag': _self['AGENT_NETWORK_TAG'],
        'ufdsConfig': _self['UFDS_CONFIG']
});

vasync.pipeline({
        'funcs': [
                setupSdcClients.bind(_self),
                function lookupPoseidon(_, subcb) {
                        _self.log.debug({
                                'datacenter': _self['DATACENTER']
                        }, 'connecting to ufds in dc');
                        var ufds = _self.DCS[_self['DATACENTER']].CLIENT.UFDS;
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
                        _self.log.debug({
                                'datacenter': _self['DATACENTER']
                        }, 'connecting to sapi in dc to get manta application');
                        var sapi = _self.DCS[_self['DATACENTER']].CLIENT.SAPI;
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
                                                        'manta application'));
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
                        _self.log.debug({
                                'datacenter': _self['DATACENTER']
                        }, 'connecting to sapi in dc to lookup instances');
                        var sapi = _self.DCS[_self['DATACENTER']].CLIENT.SAPI;

                        function onr(err, objs) {
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

                        var op = {
                                'include_master': true
                        };
                        sapi.getApplicationObjects(_self.MANTA.uuid, op, onr);
                },
                function lookupVms(_, subcb) {
                        _self.log.debug('looking up vms');
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
                        _self.log.debug('looking up servers');
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
                                for (var j = 0; j < opers.length; ++j) {
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
                        _self.log.debug('gathering host information');
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
                                // This also filters out compute instances
                                // from the list of things to monitor.
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

                                var hdc = sv.sysinfo['Datacenter Name'];
                                var nics = vm.nics;
                                var ip = null;
                                for (var j = 0; j < nics.length; ++j) {
                                        var nic = nics[j];
                                        var nt = _self['NETWORK_TAG'];
                                        if (nic.nic_tag === nt) {
                                                ip = nic.ip;
                                                break;
                                        }
                                }

                                if (!ip) {
                                        var m = 'vm doesnt have nics';
                                        _self.log.error({
                                                'uuid': uuid,
                                                'vm': vm
                                        }, m);
                                        return (subcb(new Error(m)));
                                }

                                //Finally build the host struct...
                                _self['HOSTS'].push({
                                        'hostType': vm.tags.manta_role,
                                        'ip': ip,
                                        'uuid': uuid,
                                        'datacenter': hdc,
                                        'server': server_uuid
                                });
                        }

                        //Now the marlin agents...
                        for (i = 0; i < agents.length; ++i) {
                                server_uuid = agents[i];
                                sv = _self['CNAPI_SERVERS'][server_uuid];
                                ip = null;
                                hdc = sv.sysinfo['Datacenter Name'];
                                nics = sv.sysinfo['Network Interfaces'];
                                var nns = Object.keys(nics);
                                for (j = 0; j < nns.length; ++j) {
                                        var nn = nns[j];
                                        nic = nics[nn];
                                        nt = _self['AGENT_NETWORK_TAG'];
                                        if (nic['NIC Names'].indexOf(nt) !==
                                            -1) {
                                                ip = nic['ip4addr'];
                                                break;
                                        }
                                }
                                _self['HOSTS'].push({
                                        'hostType': 'agent',
                                        'ip': ip,
                                        'uuid': server_uuid,
                                        'datacenter': hdc,
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
        var serialized = JSON.stringify({ hosts: _self['HOSTS']}, null, 2);
        fs.writeFileSync(_self['OUTPUT_FILENAME'], serialized);
        _self.log.debug('Done.');
        process.exit(0);
});
