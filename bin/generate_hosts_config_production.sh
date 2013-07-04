#!/bin/bash

###############################################################################
# This script is only to be used in prod.
###############################################################################

set -o xtrace

DIR=$(dirname $0)
OUT=/opt/smartdc/madtom/etc/checker-hosts.json

# These are hard-coded for now.  Not pretty, I know, but it's the only x-dc
#  thing we can do for the moment.  Got with:
# [nfitch@headnode (us-east-1) ~]$ vmadm list -o alias,nics.0.ip | grep binder0
$DIR/generate_hosts_config.js \
   -d us-east-1:10.0.128.13 \
   -d us-east-2:10.9.0.8 \
   -d us-east-3:10.10.0.8 \
 >$OUT
if [[ $? != 0 ]]; then
    echo 'generate_hosts_config.js failed.'
    exit 1;
fi
