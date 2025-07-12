import { Command } from "commander";
import repl from "repl";
import { runTask } from "./ai.js";
import { setContext } from "./gofer-logic.js";
// @ts-ignore
import { render, Text, Box } from 'ink';
// @ts-ignore
import * as React from 'react';
// @ts-ignore
import chalk from 'chalk';

// Enhanced console formatting utilities
const formatters = {
    success: (msg: string) => chalk.green(`[SUCCESS] ${msg}`),
    error: (msg: string) => chalk.red(`[ERROR] ${msg}`),
    info: (msg: string) => chalk.blue(`[INFO] ${msg}`),
    warning: (msg: string) => chalk.yellow(`[WARNING] ${msg}`),
    task: (msg: string) => chalk.cyan(`${msg}`),
    result: (msg: string) => chalk.magenta(`${msg}`),
    truncate: (text: string, maxLength: number = 200) => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + chalk.dim('...');
    },
    toolCall: (name: string, args: any) => {
        const argsStr = JSON.stringify(args, null, 2);
        const truncatedArgs = formatters.truncate(argsStr, 100);
        return chalk.blue(`${name}`) + chalk.dim(`(${truncatedArgs})`);
    }
};
const program = new Command();


program
    .name("Gofer")
    .description("Gofer is an AI agent that lives on your computer to help when you're away.")
    .version("1.0.0")
    .action(() => {
        launchRepl()
    });

const taskCmd = program

taskCmd
    .command("run <task>")
    .description("Run a task")
    .action((task) => {
        setContext('repl');
        runTask(task, "repl")
    })
    
program.parseAsync(process.argv).catch(err => {
    console.error(err);
    process.exit(1);
});

function Banner() {
    setContext('repl');

        return (
            <Box flexDirection="column" padding={1} borderColor="cyan" borderStyle="round">
                <Text>
                    {chalk.bold.cyan('Gofer AI Assistant')}
                    {chalk.dim(' v1.0.0')}
                </Text>
                <Text color="gray">
                    {chalk.dim('┌─ ')} Type your task or {chalk.yellow('.help')} for commands
                </Text>
                <Text color="gray">
                    {chalk.dim('└─ ')} Working directory: {chalk.blue(process.cwd())}
                </Text>
            </Box>
        );
}

let consoleRender = render(<Banner />)
consoleRender.unmount()

async function launchRepl() {
    setContext('repl');

    await new Promise(resolve => setTimeout(resolve, 1000)); // Sleep to bypass a race condition
    
    const r = repl.start({
        prompt: chalk.cyan('gofer> '),
        ignoreUndefined: true
    });
    

    // Handle task execution through input event
    r.on('line', async (input: string) => {
        const trimmedInput = input.trim();
        
        // Skip if it's empty or starts with . (built-in commands)
        if (!trimmedInput || trimmedInput.startsWith('.')) {
            return;
        }
        
        // Treat as a task for the AI agent
        try {
            console.log(`\n${formatters.task(`Starting task: ${formatters.truncate(trimmedInput, 80)}`)}\n`);
            
            const result = await runTask(trimmedInput, "repl");
            
            if (result.finalOutput) {
                console.log(`\n${formatters.success('Task completed successfully!')}`);
                console.log(`${formatters.result(formatters.truncate(result.finalOutput, 300))}\n`);
            } else {
                console.log(`\n${formatters.warning('Task completed but no output received')}\n`);
            }
        } catch (error) {
            console.error(`\n${formatters.error(`Task failed: ${error}`)}\n`);
        }
    });

    // Add custom commands
    r.defineCommand('context', {
        help: 'Show current execution context',
        action() {
            console.log(`\n${formatters.info('Current execution context: repl')}`);
            console.log(`${formatters.info(`Working directory: ${process.cwd()}`)}`);
            console.log(`${formatters.info(`Node.js version: ${process.version}`)}\n`);
            this.displayPrompt();
        }
    });

    r.defineCommand('help', {
        help: 'Show help information',
        action() {
            console.log(`\n${chalk.bold.cyan('Gofer AI Assistant Help')}`);
            console.log(`${chalk.dim('═══════════════════════════════════════')}`);
            console.log(`\n${chalk.bold('Commands:')}`);
            console.log(`  ${chalk.yellow('.help')}     - Show this help message`);
            console.log(`  ${chalk.yellow('.context')}  - Show current execution context`);
            console.log(`  ${chalk.yellow('.exit')}     - Exit the REPL`);
            console.log(`\n${chalk.bold('Usage:')}`);
            console.log(`  ${chalk.green('Simply type your task in natural language')}`);
            console.log(`\n${chalk.bold('Examples:')}`);
            console.log(`  ${chalk.dim('>')} ${chalk.cyan('list files in current directory')}`);
            console.log(`  ${chalk.dim('>')} ${chalk.cyan('check system status')}`);
            console.log(`  ${chalk.dim('>')} ${chalk.cyan('create a new file called hello.txt')}`);
            console.log(`  ${chalk.dim('>')} ${chalk.cyan('find all .js files in this project')}`);
            console.log(`\n${chalk.dim('═══════════════════════════════════════')}\n`);
            this.displayPrompt();
        }
    });

    r.on('exit', () => {
        console.log(`\n${chalk.cyan('Thanks for using Gofer!')} ${chalk.dim('Goodbye!')}`);        
        process.exit(0);
    });
}
