import { runTask } from "@/ai";
import { exec, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from 'dotenv';
import OpenAI from "openai";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TelegramBot = (await import('node-telegram-bot-api')).default;
dotenv.config({ path: path.join(__dirname, '../.env.local') });
const openai = new OpenAI();
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN!, { polling: true });

/**
 * Executes a shell command and returns a promise with the result.
 */
export function executeCommand(cmd: string): Promise<{ success: boolean, stdout: string, stderr: string }> {
    const forbiddenPatterns = [
        /\brm\s+-rf?\s+\/\s*--no-preserve-root\b/i,
        /\bdd\s+if=.*\s+of=\/dev\/(sda|nvme|hda)[0-9]*/i,
        /\bmkfs(\.\w+)?\s+\/dev\/[a-z0-9]+/i,
        /\bpasswd\b/i,
    ];

    for (const pattern of forbiddenPatterns) {
        if (pattern.test(cmd)) {
            bot.sendMessage(process.env.CHAT_ID!, `Gofer attempted to run a forbidden command: ${cmd}. Execution was blocked.`);
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

/**
 * Watches the desktop for changes and uses OpenAI to determine if a task is complete.
 */
export async function watchDesktop(watchPath: string, task: string) {
    console.log(`Watching desktop at path: ${watchPath}`);
    bot.sendMessage(process.env.CHAT_ID!, `Gofer started watching the desktop for changes`);

    const inhibitor = spawn('systemd-inhibit', [
        '--what=idle:sleep:handle-lid-switch',
        '--why=Gofer desktop watch',
        'sleep', 'infinity'
    ], { stdio: 'ignore' });

    await executeCommand(`spectacle -m -b -n -o ${watchPath}/startImage.png`);
    const startImage = PNG.sync.read(fs.readFileSync(`${watchPath}/startImage.png`));
    const startImageBase64 = fs.readFileSync(`${watchPath}/startImage.png`, 'base64');

    while (true) {
        try {
            await new Promise(resolve => setTimeout(resolve, 60000));

            await executeCommand(`spectacle -m -b -n -o ${watchPath}/latestImage.png`);
            let latestImage = PNG.sync.read(fs.readFileSync(`${watchPath}/latestImage.png`));
            let latestImageBase64 = fs.readFileSync(`${watchPath}/latestImage.png`, 'base64');
            const { width, height } = startImage;

            if (latestImage.width !== width || latestImage.height !== height) {
                console.error("Screenshot dimensions mismatch. Skipping analysis for this frame.");
                continue;
            }

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

            console.log(`Change percentage: ${changePercentage.toFixed(2)}%`);

            if (changePercentage > .5) {
                const result = await openai.responses.create({
                    model: "gpt-4.1-mini",
                    input: [
                        {
                            role: "user",
                            content: [
                                { type: "input_text", text: `Has the task been completed based on the desktop changes? The task is: ${task}. The start image is first, then the latest image. Reply with ONLY "yes" or "no" without any other text. ` },
                                { type: "input_image", image_url: `data:image/png;base64,${startImageBase64}`, detail: "auto" },
                                { type: "input_image", image_url: `data:image/png;base64,${latestImageBase64}`, detail: "auto" }
                            ]
                        }
                    ]
                });

                console.log("AI analysis result:", result);

                const finalResult = (result as any)?.final;
                const completionKeywords = ["yes", "true", "completed", "finished", "done", "success", "ok"];
                
                if (typeof finalResult === 'string' && completionKeywords.some(keyword => 
                    finalResult.toLowerCase().includes(keyword)
                )) {
                    console.log("Task completed! Stopping desktop watch.");
                    inhibitor.kill();
                    bot.sendMessage(process.env.CHAT_ID!, `Gofer stopped watching the desktop for changes. The final screenshot is attached.`);
                    bot.sendDocument(process.env.CHAT_ID!, `${watchPath}/latestImage.png`);
                    return { success: true, message: "Desktop task completed. Watcher said: " + finalResult };
                }
            }
        } catch (error: any) {
            console.error("Error in watch loop:", error);
            inhibitor.kill();
            bot.sendMessage(process.env.CHAT_ID!, `An error caused Gofer to stop watching the desktop for changes`);
            return { success: false, message: `Error watching desktop: ${error.message}` };
        }
    }
}

/**
 * user prompt function.
 */
export async function promptUser(prompt: string) {
    bot.sendMessage(process.env.CHAT_ID!, `Gofer asked: ${prompt}`);
    
    return new Promise((resolve) => {
        const messageHandler = (msg: any) => {
            if (msg.chat.id.toString() === process.env.CHAT_ID) {
                bot.removeListener('message', messageHandler);
                resolve({ success: true, response: msg.text });
            }
        };

        bot.on('message', messageHandler);
    });
}

/**
 * user update function.
 */
export async function updateUser(message: string) {
    bot.sendMessage(process.env.CHAT_ID!, `Gofer sent an update: ${message}`);
    return { success: true, message: "Update sent to user" };
}

/**
 * done function.
 */
export async function done(message: string) {
    bot.sendMessage(process.env.CHAT_ID!, `Task completed: ${message}`);
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

// =========================
// Telegram bot commands
// =========================

function isAuthorized(msg: any): boolean {
    const text = msg.text || "";
    const words = text.trim().split(/\s+/);
    const secondWord = words[1] || '';
    return msg.chat.id.toString() === process.env.CHAT_ID && secondWord === process.env.PASSCODE;
}

bot.onText(/\/start/, (msg: any) => {
    bot.sendMessage(process.env.CHAT_ID!, 'Hey! I\'m your Gofer agent. What can I do for you?');
});

bot.onText(/\/help/, (msg: any) => {
    if (isAuthorized(msg)) {
        bot.sendMessage(process.env.CHAT_ID!,
            'Here\'s the availiable commands: \n\n' +
            'run - Send Gofer a new task to run \n' +
            'status - Check the status of a task \n' +
            'screenshot - Manually grab a screenshot of the desktop \n' +
            'getfile - Have Gofer send you a file from your computer \n' +
            'cancel - Immediately cancel the currently running task \n' +
            'shutdown - Stop the Gofer server on your computer \n' +
            'help - Show a list of commands \n' +
            'To run a command, use /command <passcode> <command> \n'
        );
    }
});

bot.onText(/\/run(?:@\w+)?\s+(.+)/, (msg: any, match: RegExpMatchArray | null) => {
    if (!isAuthorized(msg)) return;

    const taskPrompt = match && match[1] ? match[1].trim() : '';

    if (!taskPrompt) {
        bot.sendMessage(process.env.CHAT_ID!, 'Please provide a task after /run. Example: /run <passcode> build the project');
        return;
    }

    runTask(taskPrompt);
    bot.sendMessage(process.env.CHAT_ID!, 'Now running your task...');
});

bot.onText(/\/shutdown/, (msg: any) => {
    process.exit(0);
});

bot.onText(/\/screenshot/, async (msg: any) => {
    if (!isAuthorized(msg)) return;
    await executeCommand(`spectacle -b -n -o /tmp/latestImage.png`);
    process.env.NTBA_FIX_350 = 'true';

    bot.sendMessage(process.env.CHAT_ID!, 'Here is the screenshot:');
    bot.sendDocument(process.env.CHAT_ID!, '/tmp/latestImage.png');
});

bot.onText(/\/getfile/, async (msg: any) => {
    if (!isAuthorized(msg)) return;

    const prompt = msg.text.split(' ').slice(1).join(' ');

    try {
        fs.statSync(prompt);
        bot.sendMessage(process.env.CHAT_ID!, 'Here is the file:');
        bot.sendDocument(process.env.CHAT_ID!, prompt);
    } catch (error) {
        console.log('There is no file at that path. Gofer will try to find it.');

        const result = await runTask(`The user is looking for the file "${prompt}". Use your command line tools to find the path. When calling to done_with_task, reply ONLY with the path, or else we won't be able to send the file. If you can't find the file, reply with "not found". Start by looking in common directories, like ~/Downloads, ~/Documents, ~/Desktop, etc.`);
        bot.sendDocument(process.env.CHAT_ID!, result.finalOutput as string);

        console.log(result);
    }
});

bot.onText(/\/status/, (msg: any) => {
    if (!isAuthorized(msg)) return;
    getLog().then((log: any) => {
        if (Array.isArray(log)) {
            const filteredLog = log.filter((item: any) => item.type === 'command' || item.type === 'watch_desktop').slice(-10);
            const formattedLog = filteredLog.map((item: any) => JSON.stringify(item, null, 2)).join('\n\n');
            bot.sendMessage(process.env.CHAT_ID!, `Here's the last 10 commands Gofer has run: 
            ${formattedLog}
            `);
        } else {
            bot.sendMessage(process.env.CHAT_ID!, 'Error: Unable to retrieve log data');
        }
    }).catch((error: any) => {
        console.error('Error getting log:', error);
        bot.sendMessage(process.env.CHAT_ID!, 'Error: Unable to retrieve log data');
    });
});

// =========================
// Server Start
// =========================
console.log('Starting Gofer daemon...');
console.log('Gofer is listening for commands...');

process.on('SIGINT', () => {
    console.log('Shutting down Gofer daemon...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down Gofer daemon...');
    process.exit(0);
});




