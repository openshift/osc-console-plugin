#!/bin/sh
set -eu

case "${OCP_VERSION:-}" in
  4.22*|5.*) BUILD_DIR=/builds/main ;;
  "")
    echo "WARNING: OCP_VERSION not set, defaulting to latest build"
    BUILD_DIR=/builds/main
    ;;
  *)
    echo "ERROR: OCP version ${OCP_VERSION} is not supported by this plugin (requires 4.22+)"
    exit 1
    ;;
esac

mkdir -p /tmp/nginx
ln -sfn "$BUILD_DIR" /tmp/nginx/html
echo "OCP_VERSION=${OCP_VERSION:-unset} -- serving $BUILD_DIR"
exec nginx -g 'daemon off;' -e stderr
