#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var gofer_logic_js_1 = require("./gofer-logic.js");
console.log("[".concat(new Date().toISOString(), "] Gofer daemon starting with PID: ").concat(process.pid));
console.log("[".concat(new Date().toISOString(), "] Gofer is listening for commands..."));
var shutdown = function (signal) {
    console.log("[".concat(new Date().toISOString(), "] Received ").concat(signal, ", shutting down gracefully..."));
    process.exit(0);
};
process.on('SIGINT', function () { return shutdown('SIGINT'); });
process.on('SIGTERM', function () { return shutdown('SIGTERM'); });
process.on('SIGQUIT', function () { return shutdown('SIGQUIT'); });
process.on('uncaughtException', function (error) {
    console.error("[".concat(new Date().toISOString(), "] Uncaught Exception:"), error);
    process.exit(1);
});
process.on('unhandledRejection', function (reason, promise) {
    console.error("[".concat(new Date().toISOString(), "] Unhandled Rejection at:"), promise, 'reason:', reason);
});
try {
    (0, gofer_logic_js_1.setupTelegramBot)();
}
catch (error) {
    console.error('Failed to start Gofer daemon:', error);
    process.exit(1);
}
