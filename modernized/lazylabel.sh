#!/bin/sh
# LazyLabel with options, from bash, zsh or sh, in this folder:
#   ./lazylabel.sh "/path/to/your/images" --port 8790 --no-open
# The same as: npm start -- "/path/to/your/images" --port 8790 --no-open
exec node "$(dirname "$0")/lazylabel-reimagined/api/dist/src/cli.js" "$@"
