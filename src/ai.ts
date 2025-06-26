import { Agent, tool, Runner, setDefaultOpenAIKey } from "@openai/agents";
import { Task } from "@/types";
import { executeCommand, watchDesktop, promptUser, updateUser, done, getLog, writeToLog } from "@/daemon";
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
        await writeToLog("command", { command: input.cmd, output: result.stdout, success: result.success }, result.success);
        console.log("TOOL: execute_command result:", result);
        return result;
    }
});

export const riskyCommandTool = tool({
    name: "execute_risky_command",
    description: "Execute a risky or possibly destructive shell command",
    parameters: z.object({ cmd: z.string() }),
    needsApproval: true, // always interrupt for approval
    execute: async ({ cmd }) => {
        console.log("TOOL: execute_risky_command called with:", cmd);
        const result = await executeCommand(cmd);
        await writeToLog("risky_command", { command: cmd, output: result.stdout, success: result.success }, result.success);
        console.log("TOOL: execute_risky_command result:", result);
        return result;
    }
});

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
        await writeToLog("watch_desktop", { path: input.path, task: input.task, result }, true);
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
        await writeToLog("prompt_user", { prompt: input.prompt, response: result }, true);
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
        await writeToLog("update_user", { message: input.message, result }, true);
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
        await writeToLog("done_with_task", { message: input.message, result }, true);
        console.log("TOOL: done_with_task result:", result);
        return result;
    }
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
    const task: Task = typeof taskInput === "string"
        ? { prompt: taskInput, from: "telegram" }
        : taskInput;

    console.log("=== TASK START ===", task.prompt);

    const runner = new Runner();
    // initial call
    let result = await runner.run(gofer, `Task: ${task.prompt}`, { maxTurns: 30 });

    // single-interruption approval hack
    if (result.interruptions?.length) {
        const intr = result.interruptions[0];
        const args = intr.rawItem.arguments;  // e.g. '{"cmd":"rm -rf ~/foo"}'
        const answer = await promptUser(`Approve this command? ${args}`) as { response: string };

        if (answer.response.trim().toLowerCase().startsWith("y")) {
            result.state.approve(intr);
        } else {
            result.state.reject(intr);
        }

        // resume exactly where we left off
        result = await runner.run(gofer, result.state, { maxTurns: 30 });
    }

    // auto-loop until done
    while (!result.finalOutput) {
        result = await runner.run(gofer, result.state, { maxTurns: 30 });
    }

    console.log("=== TASK COMPLETE ===", result.finalOutput);
    return result;
}