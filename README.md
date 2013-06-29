# Mola

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

To fill out...
