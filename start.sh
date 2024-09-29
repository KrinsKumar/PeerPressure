#!/usr/bin/env bash

export TRACKER_HOST=localhost
export TRACKER_PORT=3000
export REDIS_HOST=localhost
export REDIS_PORT=9376
export WORKER_HOST=localhost

pushd tracker

scripts/build
scripts/run

popd
pushd worker

scripts/build
scripts/run 3001 3002 3003 3004 3005

