#!/bin/bash

###############################################################################
# This script is only to be used within coal.  It may work in a bh* setting,
# but there's no guarentee at this point.  It will not work in prod.
###############################################################################

set -o xtrace

SAPI_URL=$(mdata-get SAPI_URL)
if [[ "$SAPI_URL" == "" ]]; then
    echo 'No SAPI_URL'
    exit 1;
fi
DNS=$(curl -s $SAPI_URL/instances | json -Ha -c 'this.params && this.params.alias === "binder0"' metadata.ADMIN_IP)
if [[ "$DNS" == "" ]]; then
    echo 'No DNS'
    exit 1;
fi
DATACENTER=$(mdata-get sdc:datacenter_name)
if [[ "$DATACENTER" == "" ]]; then
    echo 'No Datacenter'
    exit 1;
fi

DIR=$(dirname $0)
OUT=/opt/smartdc/madtom/etc/checker-hosts.json

$DIR/generate_hosts_config.js -d $DATACENTER:$DNS >$OUT
if [[ $? != 0 ]]; then
    echo 'generate_hosts_config.js failed.'
    exit 1;
fi
