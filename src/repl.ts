import { Command } from "commander";
import repl from "repl";
import { runTask } from "./ai";
import { setContext, getContext } from "./gofer-logic";
// Ink will be loaded dynamically when the REPL launches to avoid type issues during compilation.

const program = new Command();
// @ts-ignore
const ink = await import('ink') as any;
// @ts-ignore
const React = (await import('react')) as any;
// @ts-ignore
const chalk = (await import('chalk')).default as any;

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

    // Dynamically import Ink and React for styled CLI output
    // Using dynamic import keeps this file self-contained and bypasses type-resolution issues.
    const { render, Text, Box } = ink;

    // Load chalk for additional styling (bold text, dim text)
    // @ts-ignore


    const bannerLines = [
        React.createElement(Text, { key: 'title' }, [
            chalk.hex('#FFA500')('★ '), // star in orange-ish color
            chalk.bold.white('Welcome to Gofer!')
        ]),
        React.createElement(Text, { dimColor: true, key: 'subtitle' }, '.help for help, write anything to run a task'),
        React.createElement(Text, { dimColor: true, key: 'cwd' }, `cwd: ${process.cwd()}`)
    ];

    const inputBox = React.createElement(
        Box,
        { borderStyle: 'round', borderColor: 'orange', flexDirection: 'column', paddingX: 1, paddingY: 0 },
        [
            React.createElement(Text, { key: 'title' }, [
                chalk.hex('#FFA500')('★ '), // star in orange-ish color
                chalk.bold.white('Welcome to Gofer!')
            ]),
        ],
        Box,
        { borderStyle: 'round', borderColor: 'white', flexDirection: 'column', paddingX: 1, paddingY: 0 },
        [
            React.createElement(Text, { key: 'prompt' }, '> ')
        ]
    );

    render(inputBox);
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





