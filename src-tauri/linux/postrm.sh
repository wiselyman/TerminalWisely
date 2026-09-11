#!/bin/sh
set -e
if [ "$1" = "remove" ] || [ "$1" = "purge" ] || [ "$1" = "0" ]; then
  # deb: remove|purge ; rpm: 0 on erase
  rm -f /usr/bin/terminal-wisely
fi
