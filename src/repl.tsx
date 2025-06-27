import { Command } from "commander";
import repl from "repl";
import { runTask } from "./ai";
import { setContext, getContext } from "./gofer-logic";
// @ts-ignore
import { render, Text, Box} from 'ink';
// @ts-ignore
import * as React from 'react';
// @ts-ignore
import chalk from 'chalk';
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

async function style() {
    setContext('repl');

    function Banner() {
        return (
            <Box flexDirection="column" padding={1} borderColor="white" borderStyle="round">
                <Text>
                    {chalk.hex('#FFA500')('★ ')}
                    {chalk.bold.white('Welcome to Gofer!')}
                </Text>
                <Text dimColor>.help for help, write anything to run a task</Text>
                <Text dimColor>{`cwd: ${process.cwd()}`}</Text>
            </Box>
        );
    }
}   

async function launchRepl() {
    await style();
    const r = repl.start('');

    // Handle task execution through input event
    r.on('line', async (input: string) => {
        const trimmedInput = input.trim();
        
        // Skip if it's empty or starts with . (built-in commands)
        if (!trimmedInput || trimmedInput.startsWith('.')) {
            return;
        }
        
        // Treat as a task for the AI agent
        try {
            console.log(`\n[REPL] Running task: ${trimmedInput}\n`);
            const result = await runTask(trimmedInput, "repl");
            console.log(`\n[REPL] Task completed with result: ${result.finalOutput}\n`);
        } catch (error) {
            console.error(`\n[REPL] Error running task: ${error}\n`);
        }
    });

    // Add custom commands
    r.defineCommand('context', {
        help: 'Show current execution context',
        action() {
            console.log(`Current context: ${getContext()}`);
            this.displayPrompt();
        }
    });

    r.defineCommand('help', {
        help: 'Show help information',
        action() {
            console.log('Gofer REPL Commands:');
            console.log('  Type any task directly to run it');
            console.log('  .context - Show current execution context');
            console.log('  .help - Show this help message');
            console.log('  .exit - Exit the REPL');
            console.log('');
            console.log('Examples:');
            console.log('  gofer> list files in current directory');
            console.log('  gofer> check system status');
            console.log('  gofer> .context');
            this.displayPrompt();
        }
    });

    r.on('exit', () => {
        console.log('Exiting Gofer CLI...');
        process.exit(0);
    });


    }
