import { Agent, tool, Runner, setDefaultOpenAIKey } from "@openai/agents";
import { Task } from "@/types";
import { executeCommand, watchDesktop, stopWatchDesktop, promptUser, updateUser, done } from "@/daemon";
import { z } from "zod";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// TODO: Write all the prompts

// Load the system promps from SYSTEM.md
console.log("Loading system prompts...");
const systemPrompt = fs.readFileSync(path.join(__dirname, "./prompts/SYSTEM.md"), "utf-8");
const executorSystemPrompt = fs.readFileSync(path.join(__dirname, "./prompts/EXECUTOR.md"), "utf-8");
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
    description: "Watch the desktop for changes",
    parameters: z.object({
        path: z.string() // Path of screenshot to watch
    }),
    execute: async (input: { path: string }) => {
        console.log("TOOL: watch_desktop called with:", input);
        const result = await watchDesktop(input.path);
        console.log("TOOL: watch_desktop result:", result);
        return result;
    }
})

export const stopWatchTool = tool({
    name: "stop_watching_desktop",
    description: "Stop watching the desktop for changes",
    parameters: z.object({
        path: z.string() // Path of screenshot to watch
    }),
    execute: async (input: { path: string }) => {
        console.log("TOOL: stop_watching_desktop called with:", input);
        const result = await stopWatchDesktop(input.path);
        console.log("TOOL: stop_watching_desktop result:", result);
        return result;
    }
})

/* idk if i'm gonna need this yet so i just commented it out
export const analyzeChangesTool = tool({
    name: "analyze_changes",
    description: "Analyze the changes in the desktop by looking at the last two screenshots",
    parameters: z.object({
        path: z.string() // Path of screenshot to analyze
    }),
    execute: async (input: { path: string }) => {
        console.log("TOOL: analyze_changes called with:", input);
        const result = await analyzeChanges(input.path);
        console.log("TOOL: analyze_changes result:", result);
        return result;
    }
})
*/

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


// Agent definitions
const executor = new Agent({
    name: "Executor",
    instructions: executorSystemPrompt,
    model: "gpt-4.1-mini",
    tools: [commandTool, riskyCommandTool]
});


const executorTool = executor.asTool({
    toolName: 'execute_commands',
    toolDescription: 'Execute shell commands and perform system operations.',
    customOutputExtractor: async (result) => {
        console.log("AGENT: Executor output:", result.output);
        return result.output.toString();
    }
});


// Main agent with all agent tools
const gofer = new Agent({
    name: "Gofer",
    instructions: systemPrompt,
    model: "o4-mini",
    tools: [executorTool, promptTool, updateTool, doneTool, watchTool, stopWatchTool]
});


console.log("Main Gofer agent created with all tools");

export async function runTask(task: Task) {
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
        const output = result.output.toString();
        console.log("Gofer agent output:", output);
        console.log("=== TASK COMPLETE ===");
        return output;
    } catch (error) {
        console.error("Task failed:", error);
        console.log("=== TASK FAILED ===");
        throw error;
    }
}