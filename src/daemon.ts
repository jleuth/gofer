import express from "express";
import { runTask } from "@/ai";
import { Task } from "@/types";
import { exec } from "child_process";
import { promisify } from "util";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const app = express();

app.get("/sms", async (req, res) => { // Main entry point - this is what kicks on the agent
    const task: Task = {
        prompt: req.query.prompt as string || "Hello",
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

export async function executeCommand(command: string) { // We execute commands here because ai.ts is only responsible for agent logic. Any actual system actions are daemon-level
    console.log(`[MOCK] Executing command: ${command}`);
    return { success: true, message: `Command executed: ${command}` };
}

// Mock functions for tool calls
export async function watchDesktop(path: string) {
    console.log(`[MOCK] Watching desktop at path: ${path}`);
    return { success: true, message: `Started watching desktop at ${path}` };
}

export async function stopWatchDesktop(path: string) {
    console.log(`[MOCK] Stopped watching desktop at path: ${path}`);
    return { success: true, message: `Stopped watching desktop at ${path}` };
}

export async function promptUser(prompt: string) {
    console.log(`[MOCK] User prompt: ${prompt}`);
    return { success: true, response: "User confirmed (mock response)" };
}

export async function updateUser(message: string) {
    console.log(`[MOCK] User update: ${message}`);
    return { success: true, message: "Update sent to user" };
}

export async function done(message: string) {
    console.log(`[MOCK] Task completed: ${message}`);
    return { success: true, message: "Task marked as complete" };
}

app.listen(3000, () => {
    console.log("Server is running on port 3000");
});



