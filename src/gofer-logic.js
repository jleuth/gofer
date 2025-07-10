"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setContext = setContext;
exports.getContext = getContext;
exports.executeCommand = executeCommand;
exports.watchDesktop = watchDesktop;
exports.promptUser = promptUser;
exports.updateUser = updateUser;
exports.done = done;
exports.getLog = getLog;
exports.writeToLog = writeToLog;
exports.setupTelegramBot = setupTelegramBot;
var ai_1 = require("@/ai");
var child_process_1 = require("child_process");
var fs_1 = require("fs");
var path_1 = require("path");
var url_1 = require("url");
var dotenv_1 = require("dotenv");
var openai_1 = require("openai");
var pixelmatch_1 = require("pixelmatch");
var pngjs_1 = require("pngjs");
var node_telegram_bot_api_1 = require("node-telegram-bot-api");
// @ts-ignore
var __filename = (0, url_1.fileURLToPath)(import.meta.url);
var __dirname = path_1.default.dirname(__filename);
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env.local') });
var openai;
try {
    openai = new openai_1.default();
} catch (error) {
    console.error("Error initializing OpenAI client:", error);
    openai = null;
}

// Global error handlers to prevent crashes
process.on('uncaughtException', function(error) {
    console.error('Uncaught Exception:', error);
    console.error('Gofer will continue running, but this should be investigated.');
});

process.on('unhandledRejection', function(reason, promise) {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    console.error('Gofer will continue running, but this should be investigated.');
});

// Create bot without polling initially - polling will be enabled in setupTelegramBot()
var bot;
try {
    if (!process.env.TELEGRAM_TOKEN) {
        console.warn("Warning: TELEGRAM_TOKEN not set. Telegram functionality will be disabled.");
        bot = null;
    } else {
        bot = new node_telegram_bot_api_1.default(process.env.TELEGRAM_TOKEN, { polling: false });
    }
} catch (error) {
    console.error("Error initializing Telegram bot:", error);
    bot = null;
}

// Global context variable
var currentContext = 'telegram';

// Helper function to safely send messages via Telegram bot
function safeSendMessage(message) {
    if (!bot || !process.env.CHAT_ID) {
        console.log("[TELEGRAM UNAVAILABLE] " + message);
        return Promise.resolve();
    }
    return bot.sendMessage(process.env.CHAT_ID, message).catch(function(error) {
        console.error("Failed to send Telegram message:", error.message);
    });
}

// Helper function to safely send documents via Telegram bot
function safeSendDocument(filePath, caption) {
    if (!bot || !process.env.CHAT_ID) {
        console.log("[TELEGRAM UNAVAILABLE] Would send file: " + filePath);
        return Promise.resolve();
    }
    if (!fs_1.default.existsSync(filePath)) {
        console.error("File does not exist:", filePath);
        return safeSendMessage("Error: File not found");
    }
    var options = caption ? { caption: caption } : {};
    return bot.sendDocument(process.env.CHAT_ID, filePath, options).catch(function(error) {
        console.error("Failed to send Telegram document:", error.message);
        return safeSendMessage("Error sending file: " + error.message);
    });
}

// Helper function to ensure tmp directory exists
function ensureTmpDirectory() {
    try {
        if (!fs_1.default.existsSync('/tmp')) {
            fs_1.default.mkdirSync('/tmp', { recursive: true });
        }
    } catch (error) {
        console.error("Error ensuring /tmp directory exists:", error);
    }
}

// Check if running in demo mode
function isDemoMode() {
    return process.env.DEMO_MODE === 'true';
}

// Demo-safe command patterns that are allowed
var DEMO_SAFE_COMMANDS = [
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
var DEMO_FORBIDDEN_PATTERNS = [
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
function generateDemoResponse(cmd) {
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
    
    // Default generic response for other safe commands
    return {
        success: true,
        stdout: '[DEMO MODE] Command simulated successfully',
        stderr: ''
    };
}
// Function to set the current context
function setContext(context) {
    currentContext = context;
}
// Function to get the current context
function getContext() {
    return currentContext;
}
/**
 * Executes a shell command and returns a promise with the result.
 */
function executeCommand(cmd) {
    if (process.env.ENABLE_COMMAND_EXECUTION !== 'true') {
        return new Promise(function (resolve) {
            (0, child_process_1.exec)(cmd, function () {
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
        for (var _i = 0, DEMO_FORBIDDEN_PATTERNS_1 = DEMO_FORBIDDEN_PATTERNS; _i < DEMO_FORBIDDEN_PATTERNS_1.length; _i++) {
            var pattern = DEMO_FORBIDDEN_PATTERNS_1[_i];
            if (pattern.test(cmd)) {
                var message = "[DEMO MODE] Command blocked for security: ".concat(cmd);
                if (currentContext === 'telegram') {
                    safeSendMessage(message);
                }
                else {
                    console.log("[REPL] ".concat(message));
                }
                return Promise.resolve({
                    success: false,
                    stdout: "",
                    stderr: "Demo mode: Write operations and potentially dangerous commands are disabled for security."
                });
            }
        }

        // Check if command is safe to simulate
        var isSafeCommand = DEMO_SAFE_COMMANDS.some(function (pattern) { return pattern.test(cmd); });
        if (isSafeCommand) {
            var message = "[DEMO MODE] Simulating safe command: ".concat(cmd);
            if (currentContext === 'telegram') {
                safeSendMessage("\uD83D\uDD12 ".concat(message));
            }
            else {
                console.log("[REPL] ".concat(message));
            }
            return Promise.resolve(generateDemoResponse(cmd));
        } else {
            // Command not explicitly safe, block it
            var message = "[DEMO MODE] Command not whitelisted: ".concat(cmd);
            if (currentContext === 'telegram') {
                safeSendMessage(message);
            }
            else {
                console.log("[REPL] ".concat(message));
            }
            return Promise.resolve({
                success: false,
                stdout: "",
                stderr: "Demo mode: Only safe, read-only commands are allowed. This command is not whitelisted."
            });
        }
    }
    
    // Original forbidden patterns for normal mode
    var forbiddenPatterns = [
        /\brm\s+-rf?\s+\/\s*--no-preserve-root\b/i,
        /\bdd\s+if=.*\s+of=\/dev\/(sda|nvme|hda)[0-9]*/i,
        /\bmkfs(\.\w+)?\s+\/dev\/[a-z0-9]+/i,
        /\bpasswd\b/i,
    ];
    for (var _i = 0, forbiddenPatterns_1 = forbiddenPatterns; _i < forbiddenPatterns_1.length; _i++) {
        var pattern = forbiddenPatterns_1[_i];
        if (pattern.test(cmd)) {
            var message = "Gofer attempted to run a forbidden command: ".concat(cmd, ". Execution was blocked.");
            if (currentContext === 'telegram') {
                safeSendMessage(message);
            }
            else {
                console.log("[REPL] ".concat(message));
            }
            return Promise.resolve({
                success: false,
                stdout: "",
                stderr: "Refusing to run absolutely forbidden command: " + cmd
            });
        }
    }
    return new Promise(function (resolve) {
        (0, child_process_1.exec)(cmd, function (err, stdout, stderr) {
            resolve({
                success: !err,
                stdout: stdout.trim(),
                stderr: stderr.trim()
            });
        });
    });
}
/**
 * Watches the desktop for changes and uses OpenAI to determine if a task is complete.
 */
function watchDesktop(task) {
    return __awaiter(this, void 0, void 0, function () {
        var message, inhibitor, startImage, startImageBase64, _loop_1, state_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (process.env.ENABLE_WATCHER !== 'true') {
                        return [2 /*return*/, { success: false, message: 'Desktop watching is currently disabled.' }];
                    }
                    if (isDemoMode()) {
                        return [2 /*return*/, { success: false, message: 'Desktop watching is disabled in demo mode for security.' }];
                    }
                    ensureTmpDirectory();
                    console.log("Watching desktop at path: /tmp");
                    message = "Gofer started watching the desktop for changes";
                    if (currentContext === 'telegram') {
                        safeSendMessage(message);
                    }
                    else {
                        console.log("[REPL] ".concat(message));
                    }
                    inhibitor = (0, child_process_1.spawn)('systemd-inhibit', [
                        '--what=idle:sleep:handle-lid-switch',
                        '--why=Gofer desktop watch',
                        'sleep', 'infinity'
                    ], { stdio: 'ignore' });
                    return [4 /*yield*/, executeCommand("spectacle -m -b -n -o /tmp/startImage.png")];
                case 1:
                    _a.sent();
                    try {
                        if (!fs_1.default.existsSync("/tmp/startImage.png")) {
                            throw new Error("Start screenshot file not found");
                        }
                        startImage = pngjs_1.PNG.sync.read(fs_1.default.readFileSync("/tmp/startImage.png"));
                        startImageBase64 = fs_1.default.readFileSync("/tmp/startImage.png", 'base64');
                    } catch (error) {
                        console.error("Error reading start image:", error);
                        inhibitor.kill();
                        var errorMessage = "Failed to capture or read start screenshot";
                        if (currentContext === 'telegram') {
                            safeSendMessage(errorMessage);
                        } else {
                            console.log("[REPL] ".concat(errorMessage));
                        }
                        return [2 /*return*/, { success: false, message: errorMessage }];
                    }
                    _loop_1 = function () {
                        var latestImage, latestImageBase64, width, height, diff, pixelDiff, changePercentage, result, finalResult_1, completionKeywords, message_1, error_1, message_2;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _b.trys.push([0, 5, , 6]);
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 60000); })];
                                case 1:
                                    _b.sent();
                                    return [4 /*yield*/, executeCommand("spectacle -m -b -n -o /tmp/latestImage.png")];
                                case 2:
                                    _b.sent();
                                    try {
                                        if (!fs_1.default.existsSync("/tmp/latestImage.png")) {
                                            console.error("Latest screenshot file not found. Skipping this frame.");
                                            return [2 /*return*/, "continue"];
                                        }
                                        latestImage = pngjs_1.PNG.sync.read(fs_1.default.readFileSync("/tmp/latestImage.png"));
                                        latestImageBase64 = fs_1.default.readFileSync("/tmp/latestImage.png", 'base64');
                                    } catch (imageError) {
                                        console.error("Error reading latest image:", imageError);
                                        return [2 /*return*/, "continue"];
                                    }
                                    width = startImage.width, height = startImage.height;
                                    if (latestImage.width !== width || latestImage.height !== height) {
                                        console.error("Screenshot dimensions mismatch. Skipping analysis for this frame.");
                                        return [2 /*return*/, "continue"];
                                    }
                                    diff = new pngjs_1.PNG({ width: width, height: height });
                                    pixelDiff = (0, pixelmatch_1.default)(startImage.data, latestImage.data, diff.data, width, height, { threshold: 0.1 });
                                    changePercentage = (pixelDiff / (width * height)) * 100;
                                    console.log("Change percentage: ".concat(changePercentage.toFixed(2), "%"));
                                    if (!(changePercentage > .5)) return [3 /*break*/, 4];
                                    return [4 /*yield*/, openai.responses.create({
                                            model: process.env.WATCHER_MODEL,
                                            input: [
                                                {
                                                    role: "user",
                                                    content: [
                                                        { type: "input_text", text: "Has the task been completed based on the desktop changes? The task is: ".concat(task, ". The start image is first, then the latest image. Reply with ONLY \"yes\" or \"no\" without any other text. ") },
                                                        { type: "input_image", image_url: "data:image/png;base64,".concat(startImageBase64), detail: "auto" },
                                                        { type: "input_image", image_url: "data:image/png;base64,".concat(latestImageBase64), detail: "auto" }
                                                    ]
                                                }
                                            ]
                                        })];
                                case 3:
                                    result = _b.sent();
                                    console.log("AI analysis result:", result);
                                    finalResult_1 = result === null || result === void 0 ? void 0 : result.final;
                                    completionKeywords = ["yes", "true", "completed", "finished", "done", "success", "ok"];
                                    if (typeof finalResult_1 === 'string' && completionKeywords.some(function (keyword) {
                                        return finalResult_1.toLowerCase().includes(keyword);
                                    })) {
                                        console.log("Task completed! Stopping desktop watch.");
                                        inhibitor.kill();
                                        message_1 = "Gofer stopped watching the desktop for changes. The final screenshot is attached.";
                                        if (currentContext === 'telegram') {
                                            safeSendMessage(message_1);
                                            safeSendDocument("/tmp/latestImage.png");
                                        }
                                        else {
                                            console.log("[REPL] ".concat(message_1));
                                            console.log("[REPL] Screenshot saved to: /tmp/latestImage.png");
                                        }
                                        return [2 /*return*/, { value: { success: true, message: "Desktop task completed. Watcher said: " + finalResult_1 } }];
                                    }
                                    _b.label = 4;
                                case 4: return [3 /*break*/, 6];
                                case 5:
                                    error_1 = _b.sent();
                                    console.error("Error in watch loop:", error_1);
                                    inhibitor.kill();
                                    message_2 = "An error caused Gofer to stop watching the desktop for changes";
                                    if (currentContext === 'telegram') {
                                        safeSendMessage(message_2);
                                    }
                                    else {
                                        console.log("[REPL] ".concat(message_2));
                                    }
                                    return [2 /*return*/, { value: { success: false, message: "Error watching desktop: ".concat(error_1.message) } }];
                                case 6: return [2 /*return*/];
                            }
                        });
                    };
                    _a.label = 2;
                case 2:
                    if (!true) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1()];
                case 3:
                    state_1 = _a.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    return [3 /*break*/, 2];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * user prompt function.
 */
function promptUser(prompt) {
    return __awaiter(this, void 0, void 0, function () {
        var readline, rl_1;
        return __generator(this, function (_a) {
            if (currentContext === 'telegram') {
                safeSendMessage("Gofer asked: ".concat(prompt));
                return [2 /*return*/, new Promise(function (resolve) {
                        if (!bot || !process.env.CHAT_ID) {
                            resolve({ success: false, response: "Telegram not available" });
                            return;
                        }
                        var messageHandler = function (msg) {
                            if (msg.chat.id.toString() === process.env.CHAT_ID) {
                                bot.removeListener('message', messageHandler);
                                resolve({ success: true, response: msg.text || "" });
                            }
                        };
                        bot.on('message', messageHandler);
                    })];
            }
            else {
                readline = require('readline');
                rl_1 = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                return [2 /*return*/, new Promise(function (resolve) {
                        console.log("[REPL] Gofer asks: ".concat(prompt));
                        rl_1.question('Your response: ', function (answer) {
                            rl_1.close();
                            resolve({ success: true, response: answer });
                        });
                    })];
            }
            return [2 /*return*/];
        });
    });
}
/**
 * user update function.
 */
function updateUser(message) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if (currentContext === 'telegram') {
                safeSendMessage("Gofer sent an update: ".concat(message));
            }
            else {
                console.log("[REPL] Gofer update: ".concat(message));
            }
            return [2 /*return*/, { success: true, message: "Update sent to user" }];
        });
    });
}
/**
 * done function.
 */
function done(message) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if (currentContext === 'telegram') {
                safeSendMessage("Task completed: ".concat(message));
            }
            else {
                console.log("[REPL] Task completed: ".concat(message));
            }
            return [2 /*return*/, { success: true, message: "Task marked as complete" }];
        });
    });
}
/**
 * getLog function.
 */
function getLog() {
    return __awaiter(this, void 0, void 0, function () {
        var logPath;
        return __generator(this, function (_a) {
            try {
                logPath = path_1.default.join(__dirname, "log.json");
                if (!fs_1.default.existsSync(logPath)) {
                    return [2 /*return*/, "[]"];
                }
                return [2 /*return*/, fs_1.default.readFileSync(logPath, "utf-8")];
            } catch (error) {
                console.error("Error reading log file:", error);
                return [2 /*return*/, "[]"];
            }
        });
    });
}
/**
 * writeToLog function.
 */
function writeToLog(type, data, success) {
    return __awaiter(this, void 0, void 0, function () {
        var logPath, logData, existingLog, logEntry;
        return __generator(this, function (_a) {
            if (process.env.ENABLE_LOGGING !== 'true') {
                return [2 /*return*/, { success: false, message: "Logging is currently disabled." }];
            }
            logPath = path_1.default.join(__dirname, "log.json");
            try {
                logData = [];
                if (fs_1.default.existsSync(logPath)) {
                    existingLog = fs_1.default.readFileSync(logPath, "utf-8");
                    logData = JSON.parse(existingLog);
                }
                logEntry = {
                    timestamp: new Date().toISOString(),
                    type: type,
                    data: data,
                    success: success
                };
                logData.push(logEntry);
                if (logData.length > 100) {
                    logData = logData.slice(-100);
                }
                fs_1.default.writeFileSync(logPath, JSON.stringify(logData, null, 2));
                return [2 /*return*/, { success: true, message: "Entry logged successfully" }];
            }
            catch (error) {
                console.error("Error writing to log:", error);
                return [2 /*return*/, { success: false, message: "Error writing to log: ".concat(error) }];
            }
            return [2 /*return*/];
        });
    });
}
function isAuthorized(msg) {
    try {
        if (!msg || !msg.text || !msg.chat || !msg.chat.id) {
            return {
                authorized: false,
                message: "Invalid message format"
            };
        }
        
        var text = msg.text || "";
        var words = text.trim().split(/\s+/);
        var secondWord = words[1] || '';
        
        // Check if REVIEW_MODE is enabled
        if (process.env.REVIEW_MODE === 'true') {
            // In review mode, only require correct passcode (any chat ID allowed)
            var isAuth = secondWord === process.env.PASSCODE;
            if (!isAuth) {
                return {
                    authorized: false,
                    message: "Please send your password. The format is /command <password> <prompt/other options>"
                };
            }
            return { authorized: true };
        } else {
            // Normal mode: require both chat ID and passcode
            var isAuth = msg.chat.id.toString() === process.env.CHAT_ID && secondWord === process.env.PASSCODE;
            if (!isAuth) {
                return {
                    authorized: false,
                    message: "Please send your password. The format is /command <password> <prompt/other options>"
                };
            }
            return { authorized: true };
        }
    } catch (error) {
        console.error("Error in isAuthorized:", error);
        return {
            authorized: false,
            message: "Authorization check failed"
        };
    }
}
function setupTelegramBot() {
    var _this = this;
    if (process.env.ENABLE_TELEGRAM !== 'true') {
        return;
    }
    
    if (!bot) {
        console.error("Cannot setup Telegram bot: bot not initialized");
        return;
    }

    try {
        // Enable polling for the bot
        bot.setWebHook('');
        bot.startPolling();
    } catch (error) {
        console.error("Error starting Telegram bot:", error);
        return;
    }

    bot.onText(/\/start/, function (msg) {
        try {
            safeSendMessage('Hey! I\'m your Gofer agent. What can I do for you?');
        } catch (error) {
            console.error('Error in /start handler:', error);
        }
    });
    bot.onText(/\/help/, function (msg) {
        var auth = isAuthorized(msg);
        if (auth.authorized) {
            bot.sendMessage(process.env.CHAT_ID, 'Here\'s the availiable commands: \n\n' +
                'run - Send Gofer a new task to run \n' +
                'followup - Continue with context from previous commands \n' +
                'status - Check the status of a task \n' +
                'screenshot - Manually grab a screenshot of the desktop \n' +
                'getfile - Have Gofer send you a file from your computer \n' +
                'cancel - Immediately cancel the currently running task \n' +
                'shutdown - Stop the Gofer server on your computer \n' +
                'help - Show a list of commands \n' +
                'To run a command, use /command <passcode> <command> \n');
        }
        else {
            bot.sendMessage(process.env.CHAT_ID, auth.message);
        }
    });
    bot.onText(/\/run(?:@\w+)?\s+(.+)/, function (msg, match) {
        var auth = isAuthorized(msg);
        if (!auth.authorized) {
            bot.sendMessage(process.env.CHAT_ID, auth.message);
            return;
        }
        var taskPrompt = match && match[1] ? match[1].trim() : '';
        if (!taskPrompt) {
            bot.sendMessage(process.env.CHAT_ID, 'Please provide a task after /run. Example: /run <passcode> build the project');
            return;
        }
        setContext('telegram');
        (0, ai_1.runTask)(taskPrompt);
        bot.sendMessage(process.env.CHAT_ID, 'Now running your task...');
    });
    bot.onText(/\/followup(?:@\w+)?\s+(.+)/, function (msg, match) {
        var auth = isAuthorized(msg);
        if (!auth.authorized) {
            bot.sendMessage(process.env.CHAT_ID, auth.message);
            return;
        }
        var followupPrompt = match && match[1] ? match[1].trim() : '';
        if (!followupPrompt) {
            bot.sendMessage(process.env.CHAT_ID, 'Please provide a followup task. Example: /followup <passcode> continue the previous task');
            return;
        }
        setContext('telegram');
        getLog().then(function (log) {
            try {
                var logData = JSON.parse(log);
                var recentCommands = logData
                    .filter(function (item) { return item.type === 'command'; })
                    .slice(-10)
                    .map(function (item) { return "".concat(item.data.command, " -> ").concat(item.data.output || '(no output)'); });
                var task = {
                    prompt: "Previous context from recent commands:\n".concat(recentCommands.join('\n'), "\n\nNew task: ").concat(followupPrompt),
                    from: 'telegram',
                    previousCommands: recentCommands
                };
                (0, ai_1.runTask)(task);
                bot.sendMessage(process.env.CHAT_ID, 'Now running your followup task with context from previous commands...');
            }
            catch (error) {
                console.error('Error getting log for followup:', error);
                (0, ai_1.runTask)(followupPrompt);
                bot.sendMessage(process.env.CHAT_ID, 'Now running your followup task (no previous context available)...');
            }
        }).catch(function (error) {
            console.error('Error reading log for followup:', error);
            (0, ai_1.runTask)(followupPrompt);
            bot.sendMessage(process.env.CHAT_ID, 'Now running your followup task (no previous context available)...');
        });
    });
    bot.onText(/\/shutdown/, function (msg) {
        bot.sendMessage(process.env.CHAT_ID, 'Shutting down...');
        process.exit(0);
    });
    bot.onText(/\/screenshot/, function (msg) { return __awaiter(_this, void 0, void 0, function () {
        var auth;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    auth = isAuthorized(msg);
                    if (!auth.authorized) {
                        bot.sendMessage(process.env.CHAT_ID, auth.message);
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, executeCommand("spectacle -b -n -o /tmp/latestImage.png")];
                case 1:
                    _a.sent();
                    process.env.NTBA_FIX_350 = 'true';
                    bot.sendMessage(process.env.CHAT_ID, 'Here is the screenshot:');
                    if (fs_1.default.existsSync('/tmp/latestImage.png')) {
                        bot.sendDocument(process.env.CHAT_ID, '/tmp/latestImage.png').catch(function(err) {
                            console.error('Error sending document:', err);
                            bot.sendMessage(process.env.CHAT_ID, 'Error sending screenshot file');
                        });
                    } else {
                        bot.sendMessage(process.env.CHAT_ID, 'Error: Screenshot file not found');
                    }
                    return [2 /*return*/];
            }
        });
    }); });
    bot.onText(/\/getfile/, function (msg) { return __awaiter(_this, void 0, void 0, function () {
        var auth, prompt, error_2, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    auth = isAuthorized(msg);
                    if (!auth.authorized) {
                        bot.sendMessage(process.env.CHAT_ID, auth.message);
                        return [2 /*return*/];
                    }
                    prompt = msg.text.split(' ').slice(1).join(' ');
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 2, , 4]);
                    fs_1.default.statSync(prompt);
                    bot.sendMessage(process.env.CHAT_ID, 'Here is the file:');
                    if (fs_1.default.existsSync(prompt)) {
                        bot.sendDocument(process.env.CHAT_ID, prompt).catch(function(err) {
                            console.error('Error sending document:', err);
                            bot.sendMessage(process.env.CHAT_ID, 'Error sending file');
                        });
                    } else {
                        bot.sendMessage(process.env.CHAT_ID, 'Error: File not found');
                    }
                    return [3 /*break*/, 4];
                case 2:
                    error_2 = _a.sent();
                    console.log('There is no file at that path. Gofer will try to find it.');
                    return [4 /*yield*/, (0, ai_1.runTask)("The user is looking for the file \"".concat(prompt, "\". Use your command line tools to find the path. When calling to done_with_task, reply ONLY with the path, or else we won't be able to send the file. If you can't find the file, reply with \"not found\". Start by looking in common directories, like ~/Downloads, ~/Documents, ~/Desktop, etc."))];
                case 3:
                    result = _a.sent();
                    if (result.finalOutput && result.finalOutput !== "not found" && fs_1.default.existsSync(result.finalOutput)) {
                        bot.sendDocument(process.env.CHAT_ID, result.finalOutput).catch(function(err) {
                            console.error('Error sending document:', err);
                            bot.sendMessage(process.env.CHAT_ID, 'Error sending found file');
                        });
                    } else {
                        bot.sendMessage(process.env.CHAT_ID, 'File not found or could not be located');
                    }
                    console.log(result);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    bot.onText(/\/status/, function (msg) {
        var auth = isAuthorized(msg);
        if (!auth.authorized) {
            bot.sendMessage(process.env.CHAT_ID, auth.message);
            return;
        }
        getLog().then(function (log) {
            try {
                var logData = JSON.parse(log);
                var filteredLog = logData.filter(function (item) { return item.type === 'command' || item.type === 'watch_desktop'; }).slice(-10).reverse();
                var formattedLog = filteredLog.map(function (item) {
                    if (item.type === 'command') {
                        return "Command: ".concat(item.data.command, "\nOutput: ").concat(item.data.output || '(no output)');
                    }
                    else if (item.type === 'watch_desktop') {
                        return "Desktop Watch: ".concat(item.data.message || 'Desktop monitoring activity');
                    }
                    return '';
                }).join('\n\n');
                bot.sendMessage(process.env.CHAT_ID, "Here's the last 10 commands Gofer has run (most recent first):\n\n".concat(formattedLog));
            }
            catch (error) {
                console.error('Error getting log:', error);
                bot.sendMessage(process.env.CHAT_ID, 'Error: Unable to retrieve log data');
            }
        });
    });
}
