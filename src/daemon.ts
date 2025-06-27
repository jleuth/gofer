#!/usr/bin/env node

import { setupTelegramBot } from './gofer-logic.js';

console.log(`[${new Date().toISOString()}] Gofer daemon starting with PID: ${process.pid}`);
console.log(`[${new Date().toISOString()}] Gofer is listening for commands...`);

const shutdown = (signal: string) => {
    console.log(`[${new Date().toISOString()}] Received ${signal}, shutting down gracefully...`);
    process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGQUIT', () => shutdown('SIGQUIT'));

process.on('uncaughtException', (error) => {
    console.error(`[${new Date().toISOString()}] Uncaught Exception:`, error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`[${new Date().toISOString()}] Unhandled Rejection at:`, promise, 'reason:', reason);
});

try {
    setupTelegramBot();
} catch (error) {
    console.error('Failed to start Gofer daemon:', error);
    process.exit(1);
}