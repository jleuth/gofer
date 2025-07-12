import { Agent, tool, Runner, setDefaultOpenAIKey } from "@openai/agents";
import { Task } from "./types.js";
import { executeCommand, watchDesktop, promptUser, updateUser, done, getLog, writeToLog, setContext } from "./gofer-logic.js";
import { getProviderModel, listProviders } from "./providers.js";
import { z } from "zod";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
// @ts-ignore
import chalk from 'chalk';

// Enhanced logging utilities
const logger = {
    tool: (name: string, args: any) => {
        const argsStr = JSON.stringify(args, null, 2);
        const truncatedArgs = argsStr.length > 100 ? argsStr.substring(0, 100) + '...' : argsStr;
        console.log(chalk.blue(`[TOOL] ${name}`) + chalk.dim(`(${truncatedArgs})`));
    },
    success: (msg: string) => console.log(chalk.green(`[SUCCESS] ${msg}`)),
    error: (msg: string) => console.log(chalk.red(`[ERROR] ${msg}`)),
    info: (msg: string) => console.log(chalk.blue(`[INFO] ${msg}`)),
    result: (result: any) => {
        if (typeof result === 'string') {
            const truncated = result.length > 200 ? result.substring(0, 200) + '...' : result;
            console.log(chalk.magenta(`[RESULT] ${truncated}`));
        } else {
            const jsonStr = JSON.stringify(result, null, 2);
            const truncated = jsonStr.length > 200 ? jsonStr.substring(0, 200) + '...' : jsonStr;
            console.log(chalk.magenta(`[RESULT] ${truncated}`));
        }
    }
};

// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Still set OpenAI key for backwards compatibility
if (process.env.OPENAI_API_KEY) {
    setDefaultOpenAIKey(process.env.OPENAI_API_KEY);
}

logger.info("Loading system prompts...");
const systemPrompt = fs.readFileSync(path.join(__dirname, "./prompts/SYSTEM.md"), "utf-8");
logger.success("System prompts loaded");

export const commandTool = tool({
    name: "execute_command",
    description: "Execute a shell command and return it's stdout/stderr",
    parameters: z.object({
        cmd: z.string()
    }),
    execute: async (input: { cmd: string }) => {
        logger.tool("execute_command", { cmd: input.cmd });
        const result = await executeCommand(input.cmd);
        await writeToLog("command", { command: input.cmd, output: result.stdout, success: result.success }, result.success);
        
        if (result.success) {
            logger.success(`Command executed: ${input.cmd}`);
        } else {
            logger.error(`Command failed: ${input.cmd}`);
        }
        
        if (result.stdout) {
            logger.result(result.stdout);
        }
        
        return result;
    }
});

export const riskyCommandTool = tool({
    name: "execute_risky_command",
    description: "Execute a risky or possibly destructive shell command",
    parameters: z.object({ cmd: z.string() }),
    needsApproval: true,
    execute: async ({ cmd }) => {
        logger.tool("execute_risky_command", { cmd });
        const result = await executeCommand(cmd);
        await writeToLog("risky_command", { command: cmd, output: result.stdout, success: result.success }, result.success);
        
        if (result.success) {
            logger.success(`Risky command executed: ${cmd}`);
        } else {
            logger.error(`Risky command failed: ${cmd}`);
        }
        
        if (result.stdout) {
            logger.result(result.stdout);
        }
        
        return result;
    }
});

export const watchTool = tool({
    name: "watch_desktop",
    description: "Watch the desktop for changes. Provide the exact task that was provided to you by the user",
    parameters: z.object({
        path: z.string(),
        task: z.string()
    }),
    execute: async (input: { path: string, task: string }) => {
        logger.tool("watch_desktop", { task: input.task });
        const result = await watchDesktop(input.task);
        await writeToLog("watch_desktop", { task: input.task, result }, true);
        
        if (result.success) {
            logger.success(`Desktop watch completed for: ${input.task}`);
        } else {
            logger.error(`Desktop watch failed for: ${input.task}`);
        }
        
        logger.result(result);
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
        logger.tool("prompt_user", { prompt: input.prompt });
        const result = await promptUser(input.prompt);
        await writeToLog("prompt_user", { prompt: input.prompt, response: result }, true);
        logger.success("User responded to prompt");
        logger.result(result);
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
        logger.tool("update_user", { message: input.message });
        const result = await updateUser(input.message);
        await writeToLog("update_user", { message: input.message, result }, true);
        logger.success("User updated");
        return result;
    }
})

export const doneTool = tool({
    name: "done_with_task",
    description: "Notify the user that the task is complete",
    parameters: z.object({
        message: z.string()
    }),
    execute: async (input: { message: string }) => {
        logger.tool("done_with_task", { message: input.message });
        const result = await done(input.message);
        await writeToLog("done_with_task", { message: input.message, result }, true);
        logger.success("Task completed!");
        return result;
    }
})

export const listProvidersTool = tool({
    name: "list_providers",
    description: "List all available AI providers and their models",
    parameters: z.object({}),
    execute: async () => {
        logger.tool("list_providers", {});
        const providers = listProviders();
        const result = { providers };
        logger.success("Providers listed");
        logger.result(result);
        return result;
    }
})

// Create agent with configurable provider
function createGoferAgent() {
    const provider = process.env.GOFER_PROVIDER || 'openai';
    const model = process.env.GOFER_MODEL;
    
    let agentModel;
    
    if (provider === 'openai' && !model) {
        // Use default OpenAI model if no provider-specific model configured
        agentModel = process.env.GOFER_MODEL || 'gpt-4o-mini';
    } else if (provider !== 'openai' || model) {
        // Use provider system for non-OpenAI providers or when model is explicitly specified
        try {
            agentModel = getProviderModel(provider, model);
        } catch (error) {
            console.error(`Failed to initialize ${provider} provider:`, error);
            console.log('Falling back to OpenAI...');
            agentModel = process.env.GOFER_MODEL || 'gpt-4o-mini';
        }
    } else {
        agentModel = process.env.GOFER_MODEL || 'gpt-4o-mini';
    }
    
    return new Agent({
        name: "Gofer",
        instructions: systemPrompt,
        model: agentModel,
        tools: [commandTool, riskyCommandTool, promptTool, updateTool, doneTool, watchTool, listProvidersTool]
    });
}

const gofer = createGoferAgent();

logger.success("Main Gofer agent created with all tools");

export async function runTask(taskInput: Task | string, source?: string) {
    const task: Task = typeof taskInput === "string"
        ? { prompt: taskInput, from: source as "telegram" | "repl" || "telegram" }
        : taskInput;

    // Set context based on source
    if (source === 'repl') {
        setContext('repl');
    } else {
        setContext('telegram');
    }

    console.log(`\n${chalk.bold.green('=== TASK START ===')} ${chalk.cyan(task.prompt)}\n`);

    const runner = new Runner();

    let result = await runner.run(gofer, task.prompt, { maxTurns: 30 });

    if (result.interruptions?.length) {
        for (const intr of result.interruptions) {
            const answer = await promptUser(`Approve this command? ${intr.rawItem.arguments}`) as { response: string }
            if (answer.response.trim().toLowerCase().startsWith("y")) {
                result.state.approve(intr);
            } else {
                result.state.reject(intr);
            }
        }

        result = await runner.run(gofer, result.state, { maxTurns: 30 });
    }

    while (!result.finalOutput) {
        result = await runner.run(gofer, result.state, { maxTurns: 30 });
    }

    console.log(`\n${chalk.bold.green('=== TASK COMPLETE ===')} ${chalk.green(result.finalOutput ? 'Success' : 'No output')}\n`);
    
    if (result.finalOutput) {
        logger.result(result.finalOutput);
    }
    return result;
}