import { Command } from "commander";
import repl from "repl";
import { runTask } from "./ai";
import { setContext, getContext } from "./gofer-logic";
// Ink will be loaded dynamically when the REPL launches to avoid type issues during compilation.

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

async function launchRepl() {
    setContext('repl');

    // Dynamically import Ink and React for styled CLI output
    // Using dynamic import keeps this file self-contained and bypasses type-resolution issues.
    // @ts-ignore
    const ink = await import('ink') as any;
    // @ts-ignore
    const React = (await import('react')) as any;
    const { render, Text, Box } = ink;

    render(
        React.createElement(
            Box || Text,
            { flexDirection: 'column' },
            [
                React.createElement(Text, { color: 'green', key: 'welcome' }, 'Welcome to Gofer REPL!'),
                React.createElement(Text, { key: 'info1' }, 'Type your tasks directly, or use these commands:'),
                React.createElement(Text, { key: 'cmd1' }, '  .help - Show this help message'),
                React.createElement(Text, { key: 'cmd2' }, '  .context - Show current execution context'),
                React.createElement(Text, { key: 'cmd3' }, '  .exit - Exit the REPL'),
                React.createElement(Text, { key: 'blank' }, '')
            ]
        )
    );
    
    const r = repl.start('gofer> ');

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





