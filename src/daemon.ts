#!/usr/bin/env node

import { setupTelegramBot } from './gofer-logic.js';

// Process lifecycle management
class ProcessLifecycleManager {
    private isShuttingDown = false;
    private shutdownHandlers: Array<() => Promise<void> | void> = [];
    private healthCheckInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.setupSignalHandlers();
        this.setupErrorHandlers();
        this.startHealthCheck();
    }

    addShutdownHandler(handler: () => Promise<void> | void) {
        this.shutdownHandlers.push(handler);
    }

    private setupSignalHandlers() {
        const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'] as const;
        
        signals.forEach(signal => {
            process.on(signal, () => this.gracefulShutdown(signal));
        });
    }

    private setupErrorHandlers() {
        process.on('uncaughtException', (error) => {
            console.error(`[${new Date().toISOString()}] Uncaught Exception:`, error);
            console.error('Stack trace:', error.stack);
            
            // Give time for cleanup before exiting
            setTimeout(() => {
                process.exit(1);
            }, 5000);
            
            this.gracefulShutdown('UNCAUGHT_EXCEPTION');
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error(`[${new Date().toISOString()}] Unhandled Rejection at:`, promise, 'reason:', reason);
            
            // Log but don't exit for unhandled rejections in production
            if (process.env.NODE_ENV === 'development') {
                setTimeout(() => {
                    process.exit(1);
                }, 5000);
                
                this.gracefulShutdown('UNHANDLED_REJECTION');
            }
        });

        process.on('warning', (warning) => {
            console.warn(`[${new Date().toISOString()}] Process Warning:`, warning.name, warning.message);
        });
    }

    private startHealthCheck() {
        // Basic health check every 30 seconds
        this.healthCheckInterval = setInterval(() => {
            const memUsage = process.memoryUsage();
            const memMB = Math.round(memUsage.rss / 1024 / 1024);
            
            // Log memory usage every 5 minutes
            if (Date.now() % (5 * 60 * 1000) < 30000) {
                console.log(`[${new Date().toISOString()}] Health check - Memory usage: ${memMB}MB, Uptime: ${Math.round(process.uptime())}s`);
            }
            
            // Warning if memory usage is high
            if (memMB > 500) {
                console.warn(`[${new Date().toISOString()}] High memory usage detected: ${memMB}MB`);
            }
        }, 30000);
    }

    private async gracefulShutdown(signal: string) {
        if (this.isShuttingDown) {
            console.log(`[${new Date().toISOString()}] Shutdown already in progress...`);
            return;
        }

        this.isShuttingDown = true;
        console.log(`[${new Date().toISOString()}] Received ${signal}, shutting down gracefully...`);

        // Clear health check
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        // Run shutdown handlers
        console.log(`[${new Date().toISOString()}] Running ${this.shutdownHandlers.length} shutdown handlers...`);
        
        const shutdownPromises = this.shutdownHandlers.map(async (handler, index) => {
            try {
                console.log(`[${new Date().toISOString()}] Running shutdown handler ${index + 1}...`);
                await handler();
                console.log(`[${new Date().toISOString()}] Shutdown handler ${index + 1} completed`);
            } catch (error) {
                console.error(`[${new Date().toISOString()}] Shutdown handler ${index + 1} failed:`, error);
            }
        });

        // Wait for all shutdown handlers with timeout
        try {
            await Promise.race([
                Promise.all(shutdownPromises),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Shutdown timeout')), 10000))
            ]);
            console.log(`[${new Date().toISOString()}] Graceful shutdown completed`);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Shutdown timeout or error:`, error);
        }

        process.exit(0);
    }

    getProcessInfo() {
        return {
            pid: process.pid,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            version: process.version,
            platform: process.platform
        };
    }
}

// Initialize process lifecycle manager
const lifecycleManager = new ProcessLifecycleManager();

console.log(`[${new Date().toISOString()}] Gofer daemon starting with PID: ${process.pid}`);
console.log(`[${new Date().toISOString()}] Platform: ${process.platform}, Node.js: ${process.version}`);
console.log(`[${new Date().toISOString()}] Gofer is listening for commands...`);

// Register shutdown handlers for cleanup
lifecycleManager.addShutdownHandler(async () => {
    console.log('Stopping Telegram bot...');
    // The telegram manager cleanup will be handled automatically
});

// Start the daemon
async function startDaemon() {
    try {
        const success = await setupTelegramBot();
        if (success) {
            console.log(`[${new Date().toISOString()}] Gofer daemon started successfully`);
        } else {
            console.warn(`[${new Date().toISOString()}] Gofer daemon started with limited functionality (Telegram disabled)`);
        }
        
        // Log process info
        const info = lifecycleManager.getProcessInfo();
        console.log(`[${new Date().toISOString()}] Process info:`, {
            uptime: `${Math.round(info.uptime)}s`,
            memory: `${Math.round(info.memoryUsage.rss / 1024 / 1024)}MB`
        });
        
    } catch (error) {
        console.error('Failed to start Gofer daemon:', error);
        process.exit(1);
    }
}

startDaemon();