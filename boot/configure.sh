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
    useradd -c "Man O War" -b /home -d /home/madtom -s /usr/bin/bash madtom
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


# Don't use the standard rsyslog function, as this is not a forwarder
function manta_setup_rsyslogd {
    cat > /etc/rsyslog.conf <<"HERE"
$MaxMessageSize 64k

$ModLoad immark
$ModLoad imsolaris
$ModLoad imtcp
$ModLoad imudp

*.err;kern.notice;auth.notice			/dev/sysmsg
*.err;kern.debug;daemon.notice;mail.crit	/var/adm/messages

*.alert;kern.err;daemon.err			operator
*.alert						root

*.emerg						*

mail.debug					/var/log/syslog

auth.info					/var/log/auth.log
mail.info					/var/log/postfix.log

$template bunyan,"%msg:R,ERE,1,FIELD:(\{.*\})--end%\n"
$template PerHostFile,"/var/log/manta/%programname%/%$year%/%$month%/%$day%/%$hour%/%hostname%.log"
local0.* -?PerHostFile;bunyan

# Local1 is HAProxy
local1.* -?PerHostFile

$InputTCPServerRun 10514
$UDPServerRun 514

HERE

    svcadm restart system-log
    [[ $? -eq 0 ]] || fatal "Unable to restart rsyslog"

    # Note we don't want to use manta_add_logadm_entry as these logs should never
    # be uploaded, and sadly we need to manually setup log rotation as logadm
    # can't do finds. We only keep files older than a day around
    local crontab=/tmp/.manta_syslog_cron
    crontab -l > $crontab
    [[ $? -eq 0 ]] || fatal "Unable to write to $crontab"

    echo '16 * * * * /opt/local/bin/find /var/log/manta_ops -type f -mtime +2 -name "*.log" -delete' >> $crontab
    echo '17 * * * * /opt/local/bin/find /var/log/manta_ops -type d -empty -delete' >> $crontab

    crontab $crontab
    [[ $? -eq 0 ]] || fatal "Unable to import crons"


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

manta_setup_rsyslogd

manta_common_setup_end

exit 0
