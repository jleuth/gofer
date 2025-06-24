import { Agent, tool, Runner, setDefaultOpenAIKey } from "@openai/agents";
import { Task } from "@/types";
import { executeCommand, watchDesktop, promptUser, updateUser, done } from "@/daemon";
import { z } from "zod";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

setDefaultOpenAIKey(process.env.OPENAI_API_KEY!);

// Load the system prompts from SYSTEM.md
console.log("Loading system prompts...");
const systemPrompt = fs.readFileSync(path.join(__dirname, "./prompts/SYSTEM.md"), "utf-8");
const analyzerSystemPrompt = fs.readFileSync(path.join(__dirname, "./prompts/ANALYZER.md"), "utf-8");
console.log("System prompts loaded");

// Tool definitions

export const commandTool = tool({
    name: "execute_command",
    description: "Execute a shell command and return it's stdout/stderr",
    parameters: z.object({
        cmd: z.string()
    }),
    execute: async (input: { cmd: string }) => {
        console.log("TOOL: execute_command called with:", input);
        const result = await executeCommand(input.cmd);
        console.log("TOOL: execute_command result:", result);
        return result;
    }
})

export const riskyCommandTool = tool({
    name: "execute_risky_command",
    description: "Execute a risky or possibly destructive shell command and return it's stdout/stderr",
    parameters: z.object({
        cmd: z.string()
    }),
    needsApproval: true,
    execute: async (input: { cmd: string }) => {
        console.log("TOOL: execute_risky_command called with:", input);
        const result = await executeCommand(input.cmd);
        console.log("TOOL: execute_risky_command result:", result);
        return result;
    }
})

export const watchTool = tool({
    name: "watch_desktop",
    description: "Watch the desktop for changes. Provide the path of /tmp and the exact task that was provided to you by the user",
    parameters: z.object({
        path: z.string(), // Path of screenshot to watch
        task: z.string() // Task to complete
    }),
    execute: async (input: { path: string, task: string }) => {
        console.log("TOOL: watch_desktop called with:", input);
        const result = await watchDesktop(input.path, input.task);
        console.log("TOOL: watch_desktop result:", result);
        return result;
    }
})

export const promptTool = tool({
    name: "prompt_user",
    description: "Prompt the user for input, use this to ask the user for confirmation or to get more information",
    parameters: z.object({
        prompt: z.string()
    }),
    execute: async (input: { prompt: string }) => {
        console.log("TOOL: prompt_user called with:", input);
        const result = await promptUser(input.prompt);
        console.log("TOOL: prompt_user result:", result);
        return result;
    }
})

export const updateTool = tool({
    name: "update_user",
    description: "Update the user on the progress of the task",
    parameters: z.object({
        message: z.string()
    }),
    execute: async (input: { message: string }) => {
        console.log("TOOL: update_user called with:", input);
        const result = await updateUser(input.message);
        console.log("TOOL: update_user result:", result);
        return result;
    }
})

export const doneTool = tool({ // idk if i wanna keep this tool or not
    name: "done_with_task",
    description: "Notify the user that the task is complete",
    parameters: z.object({
        message: z.string()
    }),
    execute: async (input: { message: string }) => {
        console.log("TOOL: done_with_task called with:", input);
        const result = await done(input.message);
        console.log("TOOL: done_with_task result:", result);
        return result;
    }
})


export const analyzer = new Agent({ // This agent doesn't get called in the agent loop, it's here to be called in the daemon
    name: "Analyzer",
    instructions: analyzerSystemPrompt,
    model: "gpt-4.1-mini",
})


// Main agent with direct command execution tools
const gofer = new Agent({
    name: "Gofer",
    instructions: systemPrompt,
    model: "gpt-4.1-mini",
    tools: [commandTool, riskyCommandTool, promptTool, updateTool, doneTool, watchTool]
});


console.log("Main Gofer agent created with all tools");

export async function runTask(taskInput: Task | string) {
    // Normalize the input so the rest of the function can operate the same way
    const task: Task = (typeof taskInput === "string")
        ? { prompt: taskInput, from: "telegram" as const }
        : taskInput;

    console.log("=== TASK START ===");
    console.log("Task:", task.prompt);
    console.log("From:", task.from);
    if (task.previousCommands) {
        console.log("Previous commands:", task.previousCommands);
    }
    
    const runner = new Runner();
    const inputMessage = `Task: ${task.prompt}\nFrom: ${task.from}${task.previousCommands ? `\nPrevious Commands: ${task.previousCommands.join(', ')}` : ''}`;
    
    console.log("Input message to Gofer:", inputMessage);
    
    try {
        console.log("Running Gofer agent...");
        const result = await runner.run(gofer, inputMessage);
        console.log("Gofer agent output:", JSON.stringify(result, null, 2));
        console.log("=== TASK COMPLETE ===");
        return result;
    } catch (error) {
        console.error("Task failed:", error);
        console.log("=== TASK FAILED ===");
        throw error;
    }
}