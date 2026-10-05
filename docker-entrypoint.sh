#!/bin/sh
set -eu

mkdir -p reports
exec forge "$@"
