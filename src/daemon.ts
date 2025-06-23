// =========================
// Imports
// =========================
import express from "express";
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

// =========================
// Configuration & Constants
// =========================
dotenv.config({ path: '.env.local' });
const app = express();
const openai = new OpenAI();

// Node ESM __dirname shim
const __filename = fileURLToPath(import.meta.url); // Linter: ensure tsconfig module is set appropriately
const __dirname = path.dirname(__filename);

const analyzerSystemPrompt = fs.readFileSync(
    path.join(__dirname, "./prompts/ANALYZER.md"),
    "utf-8"
);

// =========================
// Utility Functions
// =========================
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

// =========================
// Mock Functions for Tool Calls
// =========================
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
 * Mock user prompt function.
 */
export async function promptUser(prompt: string) {
    console.log(`[MOCK] User prompt: ${prompt}`);
    return { success: true, response: "User confirmed (mock response)" };
}

/**
 * Mock user update function.
 */
export async function updateUser(message: string) {
    console.log(`[MOCK] User update: ${message}`);
    return { success: true, message: "Update sent to user" };
}

/**
 * Mock done function.
 */
export async function done(message: string) {
    console.log(`[MOCK] Task completed: ${message}`);
    return { success: true, message: "Task marked as complete" };
}

// =========================
// Express API Endpoints
// =========================

/**
 * Main entry point - this is what kicks on the agent
 */
app.get("/sms", async (req, res) => {
    const task: Task = {
        prompt: (req.query.prompt as string) || "Hello",
        from: "sms",
        previousCommands: []
    };

    try {
        runTask(task);
        res.json({ success: true, message: "Task completed successfully" });
    } catch (error) {
        console.error("Error running task:", error);
        res.status(500).json({ success: false, error: "Failed to run task" });
    }
});

// =========================
// Server Start
// =========================
app.listen(3000, () => {
    console.log("Server is running on port 3000");
});



