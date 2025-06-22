import express from "express";
import { runTask } from "./ai";
import { Task } from "./types";
import { exec } from "child_process";
import { promisify } from "util";

const app = express();

app.get("/sms", async (req, res) => { // Main entry point - this is what kicks on the agent
    const task: Task = {
        prompt: req.query.prompt as string || "Hello",
        from: "sms",
        previousCommands: []
    };
    
    try {
        await runTask(task);
        res.json({ success: true, message: "Task completed successfully" });
    } catch (error) {
        console.error("Error running task:", error);
        res.status(500).json({ success: false, error: "Failed to run task" });
    }
});

export async function executeCommand(command: string) { // We execute commands here because ai.ts is only responsible for agent logic. Any actual system actions are daemon-level

    const destructiveCommands = [
        'rm', 'del', 'delete', 'format', 'fdisk', 'dd', 'shred',
        'mkfs', 'chmod 000', 'chmod 777', 'sudo', 'su',
        'kill', 'killall', 'pkill', 'shutdown', 'reboot',
        'halt', 'poweroff', 'init 0', 'init 6'
    ];
    
    const commandLower = command.toLowerCase();
    const isDestructive = destructiveCommands.some(destructive => 
        commandLower.includes(destructive)
    );
    
    try{
        if (isDestructive) {
            throw new Error(`Potentially destructive command detected: ${command}`);
        }

        const { stdout, stderr } = await exec(command);

        return { success: true, output: stdout, error: stderr };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    } 
}






app.listen(3000, () => {
    console.log("Server is running on port 3000");
});



