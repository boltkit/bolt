#!/usr/bin/env node

process.env["ENTRYPOINT"] = "bull";
require("@backkit/kernel")({appdir: __dirname})
