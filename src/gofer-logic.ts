import { runTask } from "./ai.js";
import { exec, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from 'dotenv';
import { getRawProviderModel } from './providers.js';
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import TelegramBot from 'node-telegram-bot-api';
import { generateText } from 'ai';
// @ts-ignore
import chalk from 'chalk';

// Track the active chat ID for review mode
let activeChatId: string | null = null;

// Helper function to get the correct chat ID
function getTargetChatId(): string | null {
    if (process.env.REVIEW_MODE === 'true') {
        return activeChatId;
    } else {
        return process.env.CHAT_ID || null;
    }
}

// Centralized Telegram bot management
class TelegramBotManager {
    private bot: TelegramBot | null = null;
    private isInitialized = false;
    private messageHandlers: Map<string, (msg: any) => void> = new Map();
    private healthCheckInterval: NodeJS.Timeout | null = null;

    async initializeBot(): Promise<boolean> {
        if (this.isInitialized && this.bot) {
            return true;
        }

        try {
            if (!process.env.TELEGRAM_TOKEN) {
                console.warn("Warning: TELEGRAM_TOKEN not set. Telegram functionality will be disabled.");
                return false;
            }

            this.bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: false });
            
            // Add global error handlers
            this.bot.on('polling_error', (error) => {
                console.error('Telegram polling error:', error);
                this.handleBotError(error);
            });

            this.bot.on('webhook_error', (error) => {
                console.error('Telegram webhook error:', error);
                this.handleBotError(error);
            });

            this.isInitialized = true;
            console.log("Telegram bot initialized successfully");
            return true;
        } catch (error) {
            console.error("Error initializing Telegram bot:", error);
            this.bot = null;
            this.isInitialized = false;
            return false;
        }
    }

    async startPolling(): Promise<boolean> {
        if (!this.bot || !this.isInitialized) {
            return false;
        }

        try {
            await this.bot.setWebHook('');
            this.bot.startPolling();
            
            // Start health check
            this.startHealthCheck();
            
            console.log("Telegram bot polling started successfully");
            return true;
        } catch (error) {
            console.error("Error starting Telegram bot polling:", error);
            return false;
        }
    }

    stopPolling(): void {
        if (this.bot) {
            try {
                this.bot.stopPolling();
                console.log("Telegram bot polling stopped");
            } catch (error) {
                console.error("Error stopping bot polling:", error);
            }
        }
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    private startHealthCheck(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            if (this.bot) {
                try {
                    await this.bot.getMe();
                } catch (error) {
                    console.error('Bot health check failed:', error);
                    this.handleBotError(error);
                }
            }
        }, 60000); // Check every minute
    }

    private handleBotError(error: any): void {
        console.error('Bot encountered error:', error);
        
        // For certain errors, attempt to restart polling
        if (error.code === 'ETELEGRAM' || error.code === 'ECONNRESET') {
            console.log('Attempting to restart bot polling...');
            setTimeout(() => {
                this.restartPolling();
            }, 5000);
        }
    }

    private async restartPolling(): Promise<void> {
        try {
            this.stopPolling();
            await new Promise(resolve => setTimeout(resolve, 2000));
            await this.startPolling();
        } catch (error) {
            console.error('Failed to restart bot polling:', error);
        }
    }

    getBot(): TelegramBot | null {
        return this.bot;
    }

    isReady(): boolean {
        return this.isInitialized && this.bot !== null;
    }

    // Enhanced message sending with retry logic
    async safeSendMessage(message: string, retries = 3): Promise<boolean> {
        const chatId = getTargetChatId();
        if (!this.bot || !chatId) {
            console.log("[TELEGRAM UNAVAILABLE]", message);
            return false;
        }

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                await this.bot.sendMessage(chatId, message);
                return true;
            } catch (error: any) {
                console.error(`Failed to send Telegram message (attempt ${attempt + 1}/${retries}):`, error.message);
                if (attempt === retries - 1) {
                    return false;
                }
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }
        return false;
    }

    // Enhanced document sending with retry logic
    async safeSendDocument(filePath: string, caption?: string, retries = 3): Promise<boolean> {
        const chatId = getTargetChatId();
        if (!this.bot || !chatId) {
            console.log("[TELEGRAM UNAVAILABLE] Would send file:", filePath);
            return false;
        }

        if (!fs.existsSync(filePath)) {
            console.error("File does not exist:", filePath);
            await this.safeSendMessage("Error: File not found");
            return false;
        }

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const options = caption ? { caption } : {};
                await this.bot.sendDocument(chatId, filePath, options);
                return true;
            } catch (error: any) {
                console.error(`Failed to send Telegram document (attempt ${attempt + 1}/${retries}):`, error.message);
                if (attempt === retries - 1) {
                    await this.safeSendMessage(`Error sending file: ${error.message}`);
                    return false;
                }
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }
        return false;
    }

    cleanup(): void {
        this.stopPolling();
        this.messageHandlers.clear();
        this.bot = null;
        this.isInitialized = false;
    }
}

// Global bot manager instance
const telegramManager = new TelegramBotManager();

// Legacy compatibility functions
function safeSendMessage(botParam: TelegramBot | null, message: string): void {
    telegramManager.safeSendMessage(message);
}

function safeSendDocument(botParam: TelegramBot | null, filePath: string, caption?: string): void {
    telegramManager.safeSendDocument(filePath, caption);
}

// Enhanced messaging utilities
const messenger = {
    repl: (msg: string) => console.log(chalk.blue(`[REPL] ${msg}`)),
    telegram: (msg: string) => console.log(chalk.green(`[TELEGRAM] ${msg}`)),
    demo: (msg: string) => console.log(chalk.yellow(`[DEMO] ${msg}`)),
    error: (msg: string) => console.log(chalk.red(`[ERROR] ${msg}`)),
    success: (msg: string) => console.log(chalk.green(`[SUCCESS] ${msg}`)),
    warning: (msg: string) => console.log(chalk.yellow(`[WARNING] ${msg}`))
};
// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// Telegram bot instance with proper error handling
let bot: TelegramBot | null = null;
let botInitialized = false;

// Track the current execution context
let currentContext: 'telegram' | 'repl' = 'repl';

// Function to set the current context
export function setContext(context: 'telegram' | 'repl') {
    currentContext = context;
}

// Check if running in demo mode
function isDemoMode(): boolean {
    return process.env.DEMO_MODE === 'true';
}

// Demo-safe command patterns that are allowed
const DEMO_SAFE_COMMANDS = [
    /^ls\b/,
    /^pwd$/,
    /^whoami$/,
    /^date$/,
    /^echo\s+(?!.*\$)/,  // echo without variable expansion
    /^cat\s+\/etc\/os-release$/,
    /^uname\s+-a$/,
    /^uptime$/,
    /^df\s+-h$/,
    /^free\s+-h$/,
    /^ps\s+aux$/,
    /^which\s+\w+$/,
    /^find\s+.*-type\s+f.*-name.*$/,  // safe find commands
    /^grep\s+.*$/,
    /^head\s+.*$/,
    /^tail\s+.*$/,
    /^wc\s+.*$/,
    /^sort\s+.*$/,
    /^uniq\s+.*$/,
];

// Commands that involve writing or dangerous operations
const DEMO_FORBIDDEN_PATTERNS = [
    /\b(rm|rmdir|mv|cp|mkdir|touch|chmod|chown|sudo|su|passwd|useradd|userdel|groupadd|groupdel)\b/i,
    /\b(apt|yum|dnf|pacman|pip|npm|yarn|cargo|go\s+install)\b/i,
    /\b(systemctl|service|mount|umount|fdisk|parted|mkfs|dd)\b/i,
    /\b(git\s+commit|git\s+push|git\s+clone|git\s+pull)\b/i,
    />/,  // Any output redirection
    /\|/,  // Pipes (could be used for writes)
    /\$\{.*\}/,  // Variable expansion
    /\$\(/,  // Command substitution
    /`/,   // Backticks
    /export\s+/i,  // Environment variable setting
    /source\s+/i,  // Source files
    /\./,  // Dot sourcing
];

// Generate demo-safe fake responses
function generateDemoResponse(cmd: string): { success: boolean, stdout: string, stderr: string } {
    cmd = cmd.trim().toLowerCase();
    
    if (cmd === 'ls' || cmd.startsWith('ls ')) {
        return {
            success: true,
            stdout: 'demo_file1.txt\ndemo_file2.txt\ndemo_folder/\nREADME.md\npackage.json',
            stderr: ''
        };
    }
    
    if (cmd === 'pwd') {
        return {
            success: true,
            stdout: '/home/demo-user/demo-workspace',
            stderr: ''
        };
    }
    
    if (cmd === 'whoami') {
        return {
            success: true,
            stdout: 'demo-user',
            stderr: ''
        };
    }
    
    if (cmd === 'date') {
        return {
            success: true,
            stdout: new Date().toString(),
            stderr: ''
        };
    }
    
    if (cmd === 'uname -a') {
        return {
            success: true,
            stdout: 'Linux demo-machine 5.15.0-demo #1 SMP PREEMPT Demo x86_64 GNU/Linux',
            stderr: ''
        };
    }
    
    if (cmd === 'uptime') {
        return {
            success: true,
            stdout: '14:32:01 up 2 days, 3:21, 1 user, load average: 0.15, 0.25, 0.30',
            stderr: ''
        };
    }
    
    if (cmd === 'df -h') {
        return {
            success: true,
            stdout: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        20G  8.5G   11G  45% /\ntmpfs           2.0G     0  2.0G   0% /tmp',
            stderr: ''
        };
    }
    
    if (cmd === 'free -h') {
        return {
            success: true,
            stdout: '               total        used        free      shared  buff/cache   available\nMem:           7.8Gi       2.1Gi       4.2Gi       0.3Gi       1.5Gi       5.1Gi\nSwap:          2.0Gi          0B       2.0Gi',
            stderr: ''
        };
    }
    
    if (cmd === 'ps aux') {
        return {
            success: true,
            stdout: 'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\ndemo-user   1234  0.1  0.5  12345  6789 pts/0    S    14:30   0:00 bash\ndemo-user   5678  0.0  0.2   8901  2345 pts/0    R    14:32   0:00 ps aux',
            stderr: ''
        };
    }
    
    if (cmd.startsWith('cat /etc/os-release')) {
        return {
            success: true,
            stdout: 'NAME="Demo Linux"\nVERSION="1.0 (Demo Edition)"\nID=demo\nID_LIKE=debian\nPRETTY_NAME="Demo Linux 1.0"\nVERSION_ID="1.0"\nHOME_URL="https://demo.example.com/"\nSUPPORT_URL="https://demo.example.com/support"',
            stderr: ''
        };
    }
    
    if (cmd.startsWith('echo ')) {
        const text = cmd.substring(5);
        return {
            success: true,
            stdout: text,
            stderr: ''
        };
    }
    
    if (cmd.startsWith('find ')) {
        return {
            success: true,
            stdout: './demo_file1.txt\n./demo_folder/demo_file2.txt\n./README.md',
            stderr: ''
        };
    }
    
    // Default response for other safe commands
    return {
        success: true,
        stdout: `[DEMO MODE] Command "${cmd}" executed successfully (simulated response)`,
        stderr: ''
    };
}

/**
 * Executes a shell command and returns a promise with the result.
 */
export function executeCommand(cmd: string): Promise<{ success: boolean, stdout: string, stderr: string }> {

    if (process.env.ENABLE_COMMAND_EXECUTION !== 'true') {
        return new Promise(resolve => {
            exec(cmd, () => {
                resolve({
                    success: false,
                    stdout: '',
                    stderr: 'Command execution is currently disabled.'
                });
            });
        });
    }

    // Demo mode restrictions
    if (isDemoMode()) {
        // Check if command is explicitly forbidden in demo mode
        for (const pattern of DEMO_FORBIDDEN_PATTERNS) {
            if (pattern.test(cmd)) {
                const message = `[DEMO MODE] Command blocked for security: ${cmd}`;
                if (currentContext === 'telegram') {
                    safeSendMessage(bot, message);
                } else {
                    console.log(`[REPL] ${message}`);
                }
                return Promise.resolve({
                    success: false,
                    stdout: "",
                    stderr: "Demo mode: Write operations and potentially dangerous commands are disabled for security."
                });
            }
        }

        // Check if command is safe to simulate
        const isSafeCommand = DEMO_SAFE_COMMANDS.some(pattern => pattern.test(cmd));
        if (isSafeCommand) {
            const message = `[DEMO MODE] Simulating safe command: ${cmd}`;
            if (currentContext === 'telegram') {
                safeSendMessage(bot, `[DEMO] ${message}`);
            } else {
                console.log(`[REPL] ${message}`);
            }
            return Promise.resolve(generateDemoResponse(cmd));
        } else {
            // Command not explicitly safe, block it
            const message = `[DEMO MODE] Command not whitelisted: ${cmd}`;
            if (currentContext === 'telegram') {
                telegramManager.safeSendMessage(message);
            } else {
                console.log(`[REPL] ${message}`);
            }
            return Promise.resolve({
                success: false,
                stdout: "",
                stderr: "Demo mode: Only safe, read-only commands are allowed. This command is not whitelisted."
            });
        }
    }

    // Original forbidden patterns for normal mode
    const forbiddenPatterns = [
        /\brm\s+-rf?\s+\/\s*--no-preserve-root\b/i,
        /\bdd\s+if=.*\s+of=\/dev\/(sda|nvme|hda)[0-9]*/i,
        /\bmkfs(\.\w+)?\s+\/dev\/[a-z0-9]+/i,
        /\bpasswd\b/i,
    ];

    for (const pattern of forbiddenPatterns) {
        if (pattern.test(cmd)) {
            const message = `Gofer attempted to run a forbidden command: ${cmd}. Execution was blocked.`;
            if (currentContext === 'telegram') {
                telegramManager.safeSendMessage(message);
            } else {
                console.log(`[REPL] ${message}`);
            }
            return Promise.resolve({
                success: false,
                stdout: "",
                stderr: "Refusing to run absolutely forbidden command: " + cmd
            });
        }
    }

    return new Promise(resolve => {
        exec(cmd, (err, stdout, stderr) => {
            resolve({
                success: !err,
                stdout: stdout.trim(),
                stderr: stderr.trim()
            });
        });
    });
}

// Desktop watching configuration
interface WatcherConfig {
    maxDuration: number;        // Maximum watch duration in ms (default: 30 minutes)
    baseInterval: number;       // Base interval between checks in ms (default: 30 seconds)  
    maxInterval: number;        // Maximum interval with backoff in ms (default: 5 minutes)
    changeThreshold: number;    // Pixel change threshold (default: 0.5%)
    maxRetries: number;         // Maximum retries for failed operations (default: 3)
}

const DEFAULT_WATCHER_CONFIG: WatcherConfig = {
    maxDuration: 30 * 60 * 1000,    // 30 minutes
    baseInterval: 30 * 1000,        // 30 seconds
    maxInterval: 5 * 60 * 1000,     // 5 minutes
    changeThreshold: 0.5,           // 0.5%
    maxRetries: 3
};

// Resource cleanup utility
class DesktopWatcherCleanup {
    private resources: Array<() => void> = [];
    private isCleanedUp = false;

    addResource(cleanup: () => void) {
        if (!this.isCleanedUp) {
            this.resources.push(cleanup);
        }
    }

    cleanup() {
        if (this.isCleanedUp) return;
        this.isCleanedUp = true;
        
        for (const cleanup of this.resources) {
            try {
                cleanup();
            } catch (error) {
                console.error('Error during cleanup:', error);
            }
        }
        this.resources = [];
    }

    isCleaned(): boolean {
        return this.isCleanedUp;
    }
}

/**
 * Watches the desktop for changes and uses AI to determine if a task is complete.
 * Includes proper resource management, timeouts, and graceful error handling.
 */
export async function watchDesktop(task: string) {
    if (process.env.ENABLE_WATCHER !== 'true') {
        return {success: false, message: 'Desktop watching is currently disabled.'}
    }

    // Demo mode: disable desktop watching for security
    if (isDemoMode()) {
        const message = '[DEMO MODE] Desktop watching is disabled for security reasons';
        if (currentContext === 'telegram') {
            safeSendMessage(bot, message);
        } else {
            console.log(`[REPL] ${message}`);
        }
        return { 
            success: false, 
            message: 'Demo mode: Desktop watching is disabled for security. Task simulated as completed.' 
        };
    }

    // Load configuration
    const config: WatcherConfig = {
        maxDuration: parseInt(process.env.WATCHER_MAX_DURATION || '') || DEFAULT_WATCHER_CONFIG.maxDuration,
        baseInterval: parseInt(process.env.WATCHER_BASE_INTERVAL || '') || DEFAULT_WATCHER_CONFIG.baseInterval,
        maxInterval: parseInt(process.env.WATCHER_MAX_INTERVAL || '') || DEFAULT_WATCHER_CONFIG.maxInterval,
        changeThreshold: parseFloat(process.env.WATCHER_CHANGE_THRESHOLD || '') || DEFAULT_WATCHER_CONFIG.changeThreshold,
        maxRetries: parseInt(process.env.WATCHER_MAX_RETRIES || '') || DEFAULT_WATCHER_CONFIG.maxRetries
    };

    // Setup cleanup manager
    const cleanup = new DesktopWatcherCleanup();
    
    // Ensure tmp directory exists
    try {
        if (!fs.existsSync('/tmp')) {
            fs.mkdirSync('/tmp', { recursive: true });
        }
    } catch (error) {
        console.error('Error ensuring /tmp directory exists:', error);
        return { success: false, message: 'Failed to create temporary directory' };
    }

    console.log(`Watching desktop with config:`, {
        maxDuration: `${config.maxDuration / 1000}s`,
        baseInterval: `${config.baseInterval / 1000}s`,
        changeThreshold: `${config.changeThreshold}%`
    });
    
    const message = `Gofer started watching the desktop for changes`;
    if (currentContext === 'telegram') {
        safeSendMessage(bot, message);
    } else {
        console.log(`[REPL] ${message}`);
    }

    // Start system inhibitor
    const inhibitor = spawn('systemd-inhibit', [
        '--what=idle:sleep:handle-lid-switch',
        '--why=Gofer desktop watch',
        'sleep', 'infinity'
    ], { stdio: 'ignore' });
    
    cleanup.addResource(() => {
        try {
            if (!inhibitor.killed) {
                inhibitor.kill('SIGTERM');
                setTimeout(() => {
                    if (!inhibitor.killed) {
                        inhibitor.kill('SIGKILL');
                    }
                }, 5000);
            }
        } catch (error) {
            console.error('Error killing inhibitor:', error);
        }
    });

    // Capture initial screenshot with retry logic
    let startImage: PNG | null = null;
    let startImageBase64: string = '';
    
    for (let attempt = 0; attempt < config.maxRetries; attempt++) {
        try {
            await executeCommand(`spectacle -m -b -n -o /tmp/startImage.png`);
            
            if (!fs.existsSync('/tmp/startImage.png')) {
                throw new Error('Start screenshot file not found');
            }
            
            startImage = PNG.sync.read(fs.readFileSync('/tmp/startImage.png'));
            startImageBase64 = fs.readFileSync('/tmp/startImage.png', 'base64');
            
            // Clean up temp file
            cleanup.addResource(() => {
                try {
                    if (fs.existsSync('/tmp/startImage.png')) {
                        fs.unlinkSync('/tmp/startImage.png');
                    }
                } catch (error) {
                    console.error('Error cleaning up start image:', error);
                }
            });
            
            break;
        } catch (error: any) {
            console.error(`Screenshot attempt ${attempt + 1} failed:`, error);
            if (attempt === config.maxRetries - 1) {
                cleanup.cleanup();
                const errorMessage = 'Failed to capture initial screenshot after multiple attempts';
                if (currentContext === 'telegram') {
                    safeSendMessage(bot, errorMessage);
                } else {
                    console.log(`[REPL] ${errorMessage}`);
                }
                return { success: false, message: errorMessage };
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // Setup timeout
    const startTime = Date.now();
    const watchTimeout = setTimeout(() => {
        console.log('Desktop watching timed out');
        cleanup.cleanup();
    }, config.maxDuration);
    
    cleanup.addResource(() => clearTimeout(watchTimeout));

    // Main watching loop with exponential backoff
    let currentInterval = config.baseInterval;
    let consecutiveFailures = 0;
    
    try {
        while (Date.now() - startTime < config.maxDuration) {
            try {
                await new Promise(resolve => setTimeout(resolve, currentInterval));

                // Check if we've been stopped
                // Check if cleanup has been triggered
                if (cleanup.isCleaned()) {
                    return { success: false, message: 'Desktop watching was stopped' };
                }

                // Capture latest screenshot
                await executeCommand(`spectacle -m -b -n -o /tmp/latestImage.png`);
                
                if (!fs.existsSync('/tmp/latestImage.png')) {
                    throw new Error('Latest screenshot file not found');
                }
                
                let latestImage: PNG;
                let latestImageBase64: string;
                
                try {
                    latestImage = PNG.sync.read(fs.readFileSync('/tmp/latestImage.png'));
                    latestImageBase64 = fs.readFileSync('/tmp/latestImage.png', 'base64');
                } finally {
                    // Clean up temp file immediately
                    try {
                        if (fs.existsSync('/tmp/latestImage.png')) {
                            fs.unlinkSync('/tmp/latestImage.png');
                        }
                    } catch (cleanupError) {
                        console.error('Error cleaning up latest image:', cleanupError);
                    }
                }
                
                if (!startImage || !startImageBase64) {
                    console.error("Start image not available, stopping watch");
                    break;
                }
                
                const { width, height } = startImage;

                if (latestImage.width !== width || latestImage.height !== height) {
                    console.warn("Screenshot dimensions mismatch. Skipping analysis for this frame.");
                    consecutiveFailures++;
                    currentInterval = Math.min(currentInterval * 1.5, config.maxInterval);
                    continue;
                }

                // Calculate pixel differences
                const diff = new PNG({ width, height });
                const pixelDiff = pixelmatch(
                    startImage.data,
                    latestImage.data,
                    diff.data,
                    width,
                    height,
                    { threshold: 0.1 }
                );
                const changePercentage = (pixelDiff / (width * height)) * 100;

                console.log(`Change: ${changePercentage.toFixed(2)}% (threshold: ${config.changeThreshold}%)`);

                // Reset interval on successful operation
                consecutiveFailures = 0;
                currentInterval = config.baseInterval;

                if (changePercentage > config.changeThreshold) {
                    // Analyze with AI
                    const result = await analyzeDesktopChange(task, startImageBase64, latestImageBase64);
                    
                    if (result.completed) {
                        console.log("Task completed! Stopping desktop watch.");
                        cleanup.cleanup();
                        
                        const successMessage = `Gofer stopped watching the desktop for changes. Task completed.`;
                        if (currentContext === 'telegram') {
                            safeSendMessage(bot, successMessage);
                        } else {
                            console.log(`[REPL] ${successMessage}`);
                        }
                        return { success: true, message: "Desktop task completed. AI result: " + result.analysis };
                    }
                }
                
            } catch (error) {
                console.error("Error in watch loop:", error);
                consecutiveFailures++;
                
                // Exponential backoff for failures
                currentInterval = Math.min(currentInterval * Math.pow(2, consecutiveFailures), config.maxInterval);
                
                if (consecutiveFailures >= config.maxRetries) {
                    cleanup.cleanup();
                    const errorMessage = `Desktop watching failed after ${config.maxRetries} consecutive failures`;
                    if (currentContext === 'telegram') {
                        safeSendMessage(bot, errorMessage);
                    } else {
                        console.log(`[REPL] ${errorMessage}`);
                    }
                    return { success: false, message: errorMessage };
                }
            }
        }
        
        // Timeout reached
        cleanup.cleanup();
        const timeoutMessage = `Desktop watching timed out after ${config.maxDuration / 1000} seconds`;
        if (currentContext === 'telegram') {
            safeSendMessage(bot, timeoutMessage);
        } else {
            console.log(`[REPL] ${timeoutMessage}`);
        }
        return { success: false, message: timeoutMessage };
        
    } catch (error: any) {
        cleanup.cleanup();
        const errorMessage = `Desktop watching failed: ${error.message}`;
        if (currentContext === 'telegram') {
            telegramManager.safeSendMessage(errorMessage);
        } else {
            console.log(`[REPL] ${errorMessage}`);
        }
        return { success: false, message: errorMessage };
    }
}

/**
 * Analyzes desktop changes using AI to determine task completion
 */
async function analyzeDesktopChange(task: string, startImageBase64: string, latestImageBase64: string): Promise<{completed: boolean, analysis: string}> {
    const provider = process.env.GOFER_PROVIDER || 'openai';
    const watcherModel = process.env.WATCHER_MODEL || process.env.GOFER_MODEL || 'gpt-4o-mini';
    
    try {
        const providerModel = getRawProviderModel(provider, watcherModel);
        
        const result = await generateText({
            model: providerModel,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: `Has the task been completed based on the desktop changes? The task is: ${task}. The start image is first, then the latest image. Reply with ONLY "yes" or "no" without any other text.` },
                        { type: "image", image: startImageBase64 },
                        { type: "image", image: latestImageBase64 }
                    ]
                }
            ]
        });

        console.log("AI analysis result:", result);

        const finalResult = result.text;
        const completionKeywords = ["yes", "true", "completed", "finished", "done", "success", "ok"];
        
        const completed = typeof finalResult === 'string' && completionKeywords.some(keyword => 
            finalResult.toLowerCase().includes(keyword)
        );
        
        return { completed, analysis: finalResult };
        
    } catch (providerError) {
        console.error("Provider failed, falling back to OpenAI:", providerError);
        
        try {
            // Fallback to OpenAI if provider fails
            const OpenAI = (await import('openai')).default;
            const fallbackOpenai = new OpenAI();
            
            const result = await fallbackOpenai.responses.create({
                model: watcherModel,
                input: [
                    {
                        role: "user",
                        content: [
                            { type: "input_text", text: `Has the task been completed based on the desktop changes? The task is: ${task}. The start image is first, then the latest image. Reply with ONLY "yes" or "no" without any other text.` },
                            { type: "input_image", image_url: `data:image/png;base64,${startImageBase64}`, detail: "auto" },
                            { type: "input_image", image_url: `data:image/png;base64,${latestImageBase64}`, detail: "auto" }
                        ]
                    }
                ]
            });

            console.log("AI analysis result (fallback):", result);

            const finalResult = (result as any)?.final;
            const completionKeywords = ["yes", "true", "completed", "finished", "done", "success", "ok"];
            
            const completed = typeof finalResult === 'string' && completionKeywords.some(keyword => 
                finalResult.toLowerCase().includes(keyword)
            );
            
            return { completed, analysis: finalResult };
            
        } catch (fallbackError) {
            console.error("Both provider and fallback failed:", fallbackError);
            return { completed: false, analysis: "AI analysis failed" };
        }
    }
}

/**
 * user prompt function.
 */
export async function promptUser(prompt: string) {
    if (currentContext === 'telegram') {
        console.log("promptUser called with prompt:", prompt);
        
        const success = await telegramManager.safeSendMessage(`Gofer asked: ${prompt}`);
        if (!success) {
            return { success: false, response: "Failed to send prompt message" };
        }
        
        return new Promise<{success: boolean, response: string}>((resolve) => {
            const chatId = getTargetChatId();
            const bot = telegramManager.getBot();
            
            console.log("promptUser: Setting up message handler for chatId =", chatId);
            
            if (!chatId || !bot) {
                console.log("promptUser: No valid chat ID or bot, resolving with error");
                resolve({ success: false, response: "Telegram not available" });
                return;
            }

            let isResolved = false;
            
            const messageHandler = (msg: any) => {
                console.log("=== MESSAGE HANDLER TRIGGERED ===");
                console.log("Received message from chat:", msg.chat.id);
                console.log("Expected chat ID:", chatId);
                console.log("Message text:", msg.text);
                
                // Accept responses only from the correct chat
                const isValidChat = msg.chat.id.toString() === chatId;
                console.log("Chat ID match:", isValidChat);
                
                if (isValidChat && !isResolved) {
                    console.log("VALID RESPONSE - Resolving promise with:", msg.text);
                    isResolved = true;
                    bot.removeListener('message', messageHandler);
                    clearTimeout(timeoutHandle);
                    resolve({ success: true, response: msg.text || "" });
                } else if (!isValidChat) {
                    console.log("INVALID CHAT - Ignoring message from chat", msg.chat.id, "(expected:", chatId + ")");
                }
            };
            
            console.log("Adding message handler to bot...");
            bot.on('message', messageHandler);
            console.log("Message handler added successfully");
            
            // Add timeout to prevent hanging forever
            const timeoutMs = parseInt(process.env.PROMPT_TIMEOUT_MS || '300000'); // 5 minutes default
            const timeoutHandle = setTimeout(() => {
                console.log("⏰ TIMEOUT: No response received after", timeoutMs / 1000, "seconds");
                console.log("Current activeChatId:", activeChatId);
                console.log("Expected chatId:", chatId);
                console.log("REVIEW_MODE:", process.env.REVIEW_MODE);
                
                if (!isResolved) {
                    isResolved = true;
                    bot.removeListener('message', messageHandler);
                    resolve({ success: false, response: "Timeout: No response received" });
                }
            }, timeoutMs);
        });
    } else {
        // REPL context - use readline for user input
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise<{success: boolean, response: string}>((resolve) => {
            console.log(`[REPL] Gofer asks: ${prompt}`);
            rl.question('Your response: ', (answer: string) => {
                rl.close();
                resolve({ success: true, response: answer });
            });
        });
    }
}

/**
 * user update function.
 */
export async function updateUser(message: string) {
    if (currentContext === 'telegram') {
        await telegramManager.safeSendMessage(`Gofer sent an update: ${message}`);
    } else {
        console.log(`[REPL] Gofer update: ${message}`);
    }
    return { success: true, message: "Update sent to user" };
}

/**
 * done function.
 */
export async function done(message: string) {
    if (currentContext === 'telegram') {
        await telegramManager.safeSendMessage(`Task completed: ${message}`);
    } else {
        console.log(`[REPL] Task completed: ${message}`);
    }
    return { success: true, message: "Task marked as complete" };
}

/**
 * getLog function.
 */
export async function getLog() {
    const logPath = path.join(__dirname, "log.json");
    return fs.readFileSync(logPath, "utf-8");
}

/**
 * writeToLog function.
 */
export async function writeToLog(type: string, data: any, success: boolean) {

    if (process.env.ENABLE_LOGGING !== 'true') {
        return {success: false, message: "Logging is currently disabled."}
    }

    const logPath = path.join(__dirname, "log.json");
    
    try {
        let logData = [];
        
        if (fs.existsSync(logPath)) {
            const existingLog = fs.readFileSync(logPath, "utf-8");
            logData = JSON.parse(existingLog);
        }
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: type,
            data: data,
            success: success
        };
        
        logData.push(logEntry);
        
        if (logData.length > 100) {
            logData = logData.slice(-100);
        }
        
        fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
        
        return { success: true, message: "Entry logged successfully" };
    } catch (error) {
        console.error("Error writing to log:", error);
        return { success: false, message: `Error writing to log: ${error}` };
    }
}

function isAuthorized(msg: any): { authorized: boolean; message?: string } {
    const text = msg.text || "";
    const words = text.trim().split(/\s+/);
    const secondWord = words[1] || '';
    
    // Check if REVIEW_MODE is enabled
    if (process.env.REVIEW_MODE === 'true') {
        // In review mode, only require correct passcode (any chat ID allowed)
        const isAuth = secondWord === process.env.PASSCODE;
        if (!isAuth) {
            return {
                authorized: false,
                message: "Please send your password. The format is /command <password> <prompt/other options>"
            };
        }
        // Set active chat ID for review mode
        activeChatId = msg.chat.id.toString();
        return { authorized: true };
    } else {
        // Normal mode: require both chat ID and passcode
        const isAuth = msg.chat.id.toString() === process.env.CHAT_ID && secondWord === process.env.PASSCODE;
        if (!isAuth) {
            return {
                authorized: false,
                message: "Please send your password. The format is /command <password> <prompt/other options>"
            };
        }
        return { authorized: true };
    }
}

export async function setupTelegramBot() {
    if (process.env.ENABLE_TELEGRAM !== 'true') {
        console.log("Telegram is disabled via ENABLE_TELEGRAM setting");
        return false;
    }

    // Initialize and start the bot
    const initialized = await telegramManager.initializeBot();
    if (!initialized) {
        console.error("Failed to initialize Telegram bot");
        return false;
    }

    const pollingStarted = await telegramManager.startPolling();
    if (!pollingStarted) {
        console.error("Failed to start Telegram bot polling");
        return false;
    }

    const bot = telegramManager.getBot();
    if (!bot) {
        console.error("Bot is not available after initialization");
        return false;
    }

    // Add global message logger to debug message flow
    bot.on('message', (msg) => {
        console.log("GLOBAL: Message received from chat", msg.chat.id + ":", `'${msg.text || '[no text]'}'`);
    });

    bot.onText(/\/start/, (msg: any) => {
        // In review mode, respond to any chat. In normal mode, only respond to authorized chat
        if (process.env.REVIEW_MODE === 'true') {
            bot.sendMessage(msg.chat.id, 'Hey! I\'m your Gofer agent. What can I do for you?');
        } else if (msg.chat.id.toString() === process.env.CHAT_ID) {
            bot.sendMessage(msg.chat.id, 'Hey! I\'m your Gofer agent. What can I do for you?');
        }
    });

    bot.onText(/\/help/, (msg: any) => {
        const auth = isAuthorized(msg);
        if (auth.authorized) {
            bot.sendMessage(msg.chat.id,
                'Here\'s the availiable commands: \n\n' +
                'run - Send Gofer a new task to run \n' +
                'followup - Continue with context from previous commands \n' +
                'status - Check the status of a task \n' +
                'screenshot - Manually grab a screenshot of the desktop \n' +
                'getfile - Have Gofer send you a file from your computer \n' +
                'cancel - Immediately cancel the currently running task \n' +
                'shutdown - Stop the Gofer server on your computer \n' +
                'help - Show a list of commands \n' +
                'To run a command, use /command <passcode> <command> \n'
            );
        } else {
            bot.sendMessage(msg.chat.id, auth.message!);
        }
    });

    bot.onText(/\/run(?:@\w+)?\s+(.+)/, (msg: any, match: RegExpMatchArray | null) => {
        const auth = isAuthorized(msg);
        if (!auth.authorized) {
            bot.sendMessage(msg.chat.id, auth.message!);
            return;
        }

        const taskPrompt = match && match[1] ? match[1].trim() : '';

        if (!taskPrompt) {
            bot.sendMessage(msg.chat.id, 'Please provide a task after /run. Example: /run <passcode> build the project');
            return;
        }

        setContext('telegram');
        runTask(taskPrompt);
        safeSendMessage(bot, 'Now running your task...');
    });

    bot.onText(/\/followup(?:@\w+)?\s+(.+)/, (msg: any, match: RegExpMatchArray | null) => {
        const auth = isAuthorized(msg);
        if (!auth.authorized) {
            bot.sendMessage(msg.chat.id, auth.message!);
            return;
        }

        const followupPrompt = match && match[1] ? match[1].trim() : '';

        if (!followupPrompt) {
            bot.sendMessage(msg.chat.id, 'Please provide a followup task. Example: /followup <passcode> continue the previous task');
            return;
        }

        setContext('telegram');
        getLog().then((log: string) => {
            try {
                const logData = JSON.parse(log);
                const recentCommands = logData
                    .filter((item: any) => item.type === 'command')
                    .slice(-10)
                    .map((item: any) => `${item.data.command} -> ${item.data.output || '(no output)'}`);
                
                const task = {
                    prompt: `Previous context from recent commands:\n${recentCommands.join('\n')}\n\nNew task: ${followupPrompt}`,
                    from: 'telegram' as const,
                    previousCommands: recentCommands
                };
                
                runTask(task);
                safeSendMessage(bot, 'Now running your followup task with context from previous commands...');
            } catch (error) {
                console.error('Error getting log for followup:', error);
                runTask(followupPrompt);
                safeSendMessage(bot, 'Now running your followup task (no previous context available)...');
            }
        }).catch((error) => {
            console.error('Error reading log for followup:', error);
            runTask(followupPrompt);
            safeSendMessage(bot, 'Now running your followup task (no previous context available)...');
        });
    });

    bot.onText(/\/shutdown/, (msg: any) => {
        safeSendMessage(bot, 'Shutting down...');
        process.exit(0);
    });

    bot.onText(/\/screenshot/, async (msg: any) => {
        const auth = isAuthorized(msg);
        if (!auth.authorized) {
            bot.sendMessage(msg.chat.id, auth.message!);
            return;
        }
        await executeCommand(`spectacle -b -n -o /tmp/latestImage.png`);
        process.env.NTBA_FIX_350 = 'true';

        bot.sendMessage(msg.chat.id, 'Here is the screenshot:');
        bot.sendDocument(msg.chat.id, '/tmp/latestImage.png');
    });

    bot.onText(/\/getfile/, async (msg: any) => {
        const auth = isAuthorized(msg);
        if (!auth.authorized) {
            bot.sendMessage(msg.chat.id, auth.message!);
            return;
        }

        const prompt = msg.text.split(' ').slice(1).join(' ');

        try {
            fs.statSync(prompt);
            bot.sendMessage(msg.chat.id, 'Here is the file:');
            bot.sendDocument(msg.chat.id, prompt);
        } catch (error) {
            console.log('There is no file at that path. Gofer will try to find it.');

            const result = await runTask(`The user is looking for the file "${prompt}". Use your command line tools to find the path. When calling to done_with_task, reply ONLY with the path, or else we won't be able to send the file. If you can't find the file, reply with "not found". Start by looking in common directories, like ~/Downloads, ~/Documents, ~/Desktop, etc.`);
            bot.sendDocument(msg.chat.id, result.finalOutput as string);

            console.log(result);
        }
    });

    bot.onText(/\/status/, (msg: any) => {
        const auth = isAuthorized(msg);
        if (!auth.authorized) {
            bot.sendMessage(msg.chat.id, auth.message!);
            return;
        }

        getLog().then((log: string) => {
            try {
                const logData = JSON.parse(log);
                const filteredLog = logData.filter((item: any) => item.type === 'command' || item.type === 'watch_desktop').slice(-10).reverse();
                const formattedLog = filteredLog.map((item: any) => {
                    if (item.type === 'command') {
                        return `Command: ${item.data.command}\nOutput: ${item.data.output || '(no output)'}`;
                    } else if (item.type === 'watch_desktop') {
                        return `Desktop Watch: ${item.data.message || 'Desktop monitoring activity'}`;
                    }
                    return '';
                }).join('\n\n');
                bot.sendMessage(msg.chat.id, `Here's the last 10 commands Gofer has run (most recent first):\n\n${formattedLog}`);
            } catch (error) {
                console.error('Error getting log:', error);
                bot.sendMessage(msg.chat.id, 'Error: Unable to retrieve log data');
            }
        });
    });
}