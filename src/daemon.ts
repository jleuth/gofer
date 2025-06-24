import { runTask } from "@/ai";
import { Task } from "@/types";
import { exec } from "child_process";
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
    console.log(`[MOCK] Watching desktop at path: ${watchPath}`);

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

            if (changePercentage > 1) { // A significant change occurred
                const result = await openai.responses.create({
                    model: "gpt-4o-mini",
                    input: [
                        {
                            role: "user",
                            content: [
                                { type: "input_text", text: `Has the task been completed based on the desktop changes? The task is: ${task}. The start image is first, then the latest image.` },
                                { type: "input_image", image_url: `data:image/png;base64,${startImageBase64}`, detail: "high" },
                                { type: "input_image", image_url: `data:image/png;base64,${latestImageBase64}`, detail: "high" }
                            ]
                        }
                    ]
                });

                console.log("AI analysis result:", result);

                // Check if the AI indicates the task is complete
                const finalResult = (result as any)?.final;
                if (typeof finalResult === 'string' && finalResult.toLowerCase().includes('yes')) {
                    console.log("Task completed! Stopping desktop watch.");
                    return { success: true, message: "Desktop task completed." };
                }
            }
        } catch (error: any) {
            console.error("Error in watch loop:", error);
            return { success: false, message: `Error watching desktop: ${error.message}` };
        }
    }
}

/**
 * user prompt function.
 */
export async function promptUser(prompt: string) {
    bot.sendMessage(process.env.CHAT_ID!, `Gofer asked: ${prompt}`);
    
    const response = await bot.on('message', (msg: any) => { // Wait for user response
        return msg.text;
    });

    return { success: true, response: response };
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

bot.onText(/\/start/, (msg: any) => {
    if (msg.chat.id.toString() === process.env.CHAT_ID) {
        bot.sendMessage(process.env.CHAT_ID!, 'Hey! I\'m your Gofer agent. What can I do for you?');
    } else {
        console.log("Not authorized");
    }
});

bot.onText(/\/help/, (msg: any) => {
    if (msg.chat.id.toString() === process.env.CHAT_ID) {
        bot.sendMessage(process.env.CHAT_ID!, 'Here\'s the availiable commands: \n\n' +
            'run - Send Gofer a new task to run \n' +
            'status - Check the status of a task \n' +
            'cancel - Immediately cancel the currently running task \n' +
            'shutdown - Stop the Gofer server on your computer \n' +
            'help - Show a list of commands \n'
        );
    } else {
        console.log("Not authorized");
    }
});

bot.onText(/\/run/, (msg: any) => {
    if (msg.chat.id.toString() === process.env.CHAT_ID) {
        runTask(msg.text);
        bot.sendMessage(process.env.CHAT_ID!, 'Now running your task...');
    } else {
        console.log("Not authorized");
    }
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




