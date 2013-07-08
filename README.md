# Madtom

Repository: <git@git.joyent.com:madtom.git>
Browsing: <https://mo.joyent.com/madtom>
Who: Nate Fitch
Docs: <https://mo.joyent.com/docs/madtom>
Tickets/bugs: <https://devhub.joyent.com/jira/browse/MANTA>

# Overview

Madtom is the mantified node-checker, so that we have a pretty ui for seeing
which components in the system are currently up.

# Repository

    deps/           Git submodules and/or commited 3rd-party deps should go
                    here. See "node_modules/" for node.js deps.
    docs/           Project docs (restdown)
    lib/            Source files.
    node_modules/   Node.js deps, either populated at build time or commited.
                    See Managing Dependencies.
    pkg/            Package lifecycle scripts
    test/           Test suite
    tools/          Miscellaneous dev/upgrade/deployment tools and data.
    Makefile
    package.json    npm module info (holds the project version)
    README.md

# Development

To check out and run the tests:

    git clone git@git.joyent.com:madtom.git
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
       -l $sdc_datacenter -f /var/tmp/madtom-hosts.json | bunyan

Then fire up the madtom server (which is a very thin shim over the node-checker
server):

    $ node ./server.js -c ./etc/checker-coal.json -c /var/tmp/madtom-hosts.json |
      bunyan

Note that the order of `-c` is significant.  Finally, point your browser at:

    http://localhost:8080/checker.html

You should see the status of all processes in coal.
