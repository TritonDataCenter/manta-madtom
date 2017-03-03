<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright (c) 2017, Joyent, Inc.
-->

# manta-madtom

This repository is part of the Joyent Manta project.  For contribution
guidelines, issues, and general documentation, visit the main
[Manta](http://github.com/joyent/manta) project page.

Madtom is the mantified node-checker, so that we have a "pretty" UI for seeing
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

# Setup

    git clone https://github.com/joyent/manta-madtom.git
    cd manta-madtom
    make all

# Development

You first need to generate a hosts configuration file.  If you are working in a
build zone, you should navigate the filesystem to find the etc/config.json file
relative to the project's source code.  If you are working off of an image that
has been built and deployed, you will find the file in
`/opt/smartdc/madtom/etc/config.json`.  Once you have the file and have
recreated it in your project directory under etc/config.json (which you'll have
to make), you can run the following command to generate a hosts file of
components you'd like to see on the madtom dashboard:

    $ ./bin/generate_hosts_config.js -c etc/config.json \
        -f /var/tmp/madtom-hosts.json

Please note that if you use different file paths than those shown here, your
tests for `generate_hosts_config` will break (unless you change those
variables' values).

You'll also want to copy one of the configuration templates in the
`sapi\_manifests` directory to a new file and fill in any required properties.
For example, you might copy `./sapi\_manifests/madtom\_coal/template` to
`etc/checker-coal.json` if you are using CoaL, and the corresponding
checker-lab file for developing on a lab setup.

Then fire up the madtom server (which is a very thin shim over the node-checker
server):

    $ node ./server.js -c ./etc/checker-{env}.json \
      -c /var/tmp/madtom-hosts.json | bunyan

Note that the order of `-c` is significant.  Finally, point your browser at:

    http://{localhost or your IP}:8080

You may have to set up SSH tunneling or an NFS server from your development
environment depending on where you need to access the browser.

You should see the status of all processes running in CoaL or your lab
environment.

# Testing

To run the tests use the command `make test`.  As of April 2017, these tests
enforce the arguments set by the command line interface.  In order to test
whether or not the configuration file is generated properly despite upstream
issues, you will have to manually run system-level integration tests.

Before commiting/pushing run `make prepush` and get a code review.
