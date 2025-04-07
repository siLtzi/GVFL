#!/bin/bash

# setup-cron.sh

# This script sets up cron jobs to run fantasy checks and post standings every 6/12 hours.
# You should run this manually with absolute paths or customize it as needed.

# Define project root and node path
PROJECT_DIR="/root/GVFL"
NODE_PATH=$(which node)

# Write crontab entries safely (overwrite any old ones from this script)
crontab -l 2>/dev/null | grep -v 'runFantasyCheck.js\|runPostStandings.js' > tempcron

echo "0 */12 * * * $NODE_PATH $PROJECT_DIR/jobs/runFantasyCheck.js >> $PROJECT_DIR/logs/fantasyCheck.log 2>&1" >> tempcron
echo "0 */6 * * * $NODE_PATH $PROJECT_DIR/jobs/runPostStandings.js >> $PROJECT_DIR/logs/postStandings.log 2>&1" >> tempcron

crontab tempcron
rm tempcron

echo "✅ Cron jobs installed."
