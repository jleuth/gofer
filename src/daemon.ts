import { runTask } from "@/ai";
import { Task } from "@/types";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import pixelmatch from "pixelmatch";
import fs from "fs";
import { PNG } from "pngjs";
import dotenv from 'dotenv';
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TelegramBot = (await import('node-telegram-bot-api')).default;
dotenv.config({ path: path.join(__dirname, '../.env.local') });
const openai = new OpenAI();

const token = process.env.TELEGRAM_TOKEN!;
const bot = new TelegramBot(token, { polling: true });

const analyzerSystemPrompt = fs.readFileSync(
    path.join(__dirname, "./prompts/ANALYZER.md"),
    "utf-8"
);

/**
 * Executes a shell command and returns a promise with the result.
 */
export function executeCommand(cmd: string): Promise<{ success: boolean, stdout: string, stderr: string }> {

    // Refuse to run absolutely forbidden commands, regardless of user approval.
    // These are commands that should never be run autonomously under any circumstances.
    const forbiddenPatterns = [
        /\brm\s+-rf?\s+\/\s*--no-preserve-root\b/i, // rm -rf / --no-preserve-root
        /\bdd\s+if=.*\s+of=\/dev\/(sda|nvme|hda)[0-9]*/i, // dd to disk
        /\bmkfs(\.\w+)?\s+\/dev\/[a-z0-9]+/i, // mkfs on a device
        /\bpasswd\b/i, // passwd command
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

    const inhibitor = spawn('systemd-inhibit', [ // Prevent sleep while watching desktop.
        '--what=idle:sleep:handle-lid-switch',
        '--why=Gofer desktop watch',
        'sleep', 'infinity'
      ], { stdio: 'ignore' });

    // Take initial screenshot
    await executeCommand(`spectacle -m -b -n -o ${watchPath}/startImage.png`);
    const startImage = PNG.sync.read(fs.readFileSync(`${watchPath}/startImage.png`));
    const startImageBase64 = fs.readFileSync(`${watchPath}/startImage.png`, 'base64');
    let latestImage: PNG;
    let latestImageBase64: string;

    while (true) {
        try {
            // Wait for 60 seconds before checking again
            await new Promise(resolve => setTimeout(resolve, 60000));

            // Take new screenshot
            await executeCommand(`spectacle -m -b -n -o ${watchPath}/latestImage.png`);
            latestImage = PNG.sync.read(fs.readFileSync(`${watchPath}/latestImage.png`));
            latestImageBase64 = fs.readFileSync(`${watchPath}/latestImage.png`, 'base64');
            const { width, height } = startImage;

            // Ensure dimensions match before comparing
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

            if (changePercentage > .5) { // A significant change occurred
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

                // Check if the AI indicates the task is complete
                const finalResult = (result as any)?.final;
                const completionKeywords = [
                    "yes",
                    "true", 
                    "completed",
                    "finished",
                    "done",
                    "success",
                    "ok"
                ];
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

// =========================
// Telegram bot commands
// =========================

// Helper function for authorization check
function isAuthorized(msg: any): boolean {
    const text = msg.text || "";
    // Match: /anycommand passcode ...
    const words = text.trim().split(/\s+/);
    const secondWord = words[1] || '';
    console.log(secondWord + "|" + words);
    return msg.chat.id.toString() === process.env.CHAT_ID && secondWord === process.env.PASSCODE;
}

function sendToUser(message: string) {
    bot.sendMessage(process.env.CHAT_ID!, message);
}

bot.onText(/\/start/, (msg: any) => {
        sendToUser('Hey! I\'m your Gofer agent. What can I do for you?');
});

bot.onText(/\/help/, (msg: any) => {
    if (isAuthorized(msg)) {
        sendToUser(
            'Here\'s the availiable commands: \n\n' +
            'run - Send Gofer a new task to run \n' +
            'status - Check the status of a task \n' + // todo
            'grab - Manually grab a screenshot of the desktop \n' +
            'cancel - Immediately cancel the currently running task \n' + // todo
            'shutdown - Stop the Gofer server on your computer \n' + // todo
            'help - Show a list of commands \n' +
            'To run a command, use /command <passcode> <command> \n'
        );
    }
});

// Match "/run <task description>
bot.onText(/\/run(?:@\w+)?\s+(.+)/, (msg: any, match: RegExpMatchArray | null) => {
    if (!isAuthorized(msg)) return;

    const taskPrompt = match && match[1] ? match[1].trim() : '';

    if (!taskPrompt) {
        sendToUser('Please provide a task after /run. Example: /run <passcode> build the project');
        return;
    }

    runTask(taskPrompt);
    sendToUser('Now running your task...');
});

// =========================
// Server Start
// =========================
console.log('Starting Gofer daemon...');
console.log('Gofer is listening for commands...');

// Keep the process alive
process.on('SIGINT', () => {
    console.log('Shutting down Gofer daemon...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down Gofer daemon...');
    process.exit(0);
});




