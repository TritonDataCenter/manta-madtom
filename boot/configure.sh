#!/bin/bash
# -*- mode: shell-script; fill-column: 80; -*-

set -o xtrace

SOURCE="${BASH_SOURCE[0]}"
if [[ -h $SOURCE ]]; then
    SOURCE="$(readlink "$SOURCE")"
fi
DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
SVC_ROOT=/opt/smartdc/madtom

source ${DIR}/scripts/util.sh
source ${DIR}/scripts/services.sh


export PATH=$SVC_ROOT/build/node/bin:/opt/local/bin:/usr/sbin/:/usr/bin:$PATH

function manta_setup_madtom_user {
    useradd -c "Madtom" -b /home -d /home/madtom -s /usr/bin/bash madtom
    usermod -K defaultpriv=basic,net_privaddr madtom
    mkdir /home/madtom
    chown madtom /home/madtom
    cp -r /root/.ssh /home/madtom/.
    chown -R madtom /home/madtom/.ssh
    cat /opt/smartdc/common/etc/config.json | \
        json -e "manta.sign.key='/home/madtom/.ssh/id_rsa'" \
        >/home/madtom/manta.config.json
}

function manta_add_madtom_to_path {
    while IFS='' read -r line
    do
        if [[ $line == export\ PATH=* ]]
        then
            B=$(echo "$line" | cut -d '=' -f 1)
            E=$(echo "$line" | cut -d '=' -f 2)
            echo $B=/opt/smartdc/madtom/bin:$E
        else
            echo "$line"
        fi
    done < /root/.bashrc >/root/.bashrc_new
    mv /root/.bashrc_new /root/.bashrc
}

function manta_setup_madtom {
    local crontab=/tmp/.manta_madtom_cron
    crontab -l > $crontab
    [[ $? -eq 0 ]] || fatal "Unable to write to $crontab"

    #Server
    svccfg import /opt/smartdc/madtom/smf/manifests/madtom.xml \
        || fatal "unable to import madtom manifest"
    svcadm enable madtom || fatal "unable to start madtom"

    manta_add_logadm_entry "madtom"
}


# Mainline

echo "Running common setup scripts"
manta_common_presetup

echo "Adding local manifest directories"
manta_add_manifest_dir "/opt/smartdc/madtom"

manta_common_setup "madtom"

manta_ensure_zk

manta_setup_madtom_user

manta_add_madtom_to_path

echo "Setting up madtom crons"
manta_setup_madtom

manta_common_setup_end

exit 0
