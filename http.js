#!/usr/bin/env node

process.env["ENTRYPOINT"] = "koa";
require("@backkit/kernel")({appdir: __dirname})
