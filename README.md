<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright (c) 2014, Joyent, Inc.
-->

# manta-madtom

This repository is part of the Joyent Manta project.  For contribution
guidelines, issues, and general documentation, visit the main
[Manta](http://github.com/joyent/manta) project page.

Madtom is the mantified node-checker, so that we have a "pretty" ui for seeing
which components in the system are currently up.

# Repository

    bin/            Commands available in $PATH.
    boot/           Configuration scripts on zone setup.
    deps/           Git submodules and/or commited 3rd-party deps should go
                    here. See "node_modules/" for node.js deps.
    docs/           Project docs (restdown)
    lib/            Source files.
    node_modules/   Node.js deps, either populated at build time or commited.
                    See Managing Dependencies.
    sapi_manifests/ SAPI manifests for zone configuration.
    smf/manifests   SMF manifests.
    test/           Test suite.
    tools/          Miscellaneous dev/upgrade/deployment tools and data.
    Makefile
    package.json    npm module info (holds the project version)
    README.md

# Development

To check out and run the tests:

    git clone git@github.com:joyent/manta-madtom.git
    cd madtom
    make all
    make test

Before commiting/pushing run `make prepush` and, if possible, get a code
review.

# Testing

You first need to generate a hosts config from a running coal (note that `head`
here is coal's GZ):

    $ export sdc_datacenter=$(ssh -q head "sysinfo | json 'Datacenter Name'")
    $ export sdc_dns=$(ssh -q head "vmadm list -o alias,nics.0.ip" | \
                       grep binder | tr -s ' ' | cut -d ' ' -f 2)
    $ ./bin/generate_hosts_config.js -d $sdc_datacenter:$sdc_dns \
       -l $sdc_datacenter -f /var/tmp/madtom-hosts.json -n admin | bunyan

You'll also want to copy one of the configuration templates in the
"sapi\_manifests" directory to a new file and fill in any required properties.
For example, you might copy ./sapi\_manifests/madtom\_coal/template to
etc/checker-coal.json.

Then fire up the madtom server (which is a very thin shim over the node-checker
server):

    $ node ./server.js -c ./etc/checker-coal.json \
      -c /var/tmp/madtom-hosts.json | bunyan

Note that the order of `-c` is significant.  Finally, point your browser at:

    http://localhost:8080

You should see the status of all processes in coal.
