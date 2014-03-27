#!/bin/sh

# Generate jsduck documentation
# See [https://github.com/senchalabs/jsduck]

jsduck  lib/*.js \
        --output="doc" \
        --title="restify-session documentation" \
		--footer="Copyright (c) 2012-2014 Yoovant by Marcello Gesmundo" \
        --warnings=-link,-dup_member,-no_doc
