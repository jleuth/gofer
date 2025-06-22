import { OpenAI } from "openai";
import { Task } from "./types";
import { executeCommand } from "./daemon";
import * as fs from 'fs';
import * as path from 'path';
// TODO: Write all the prompts

// Load the system prompt from SYSTEM.md
const systemPrompt = fs.readFileSync(path.join(__dirname, '..', 'SYSTEM.md'), 'utf-8');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function runTask(task: Task, maxTurns = 10) {

    let currentTurn = 0;
    let isFirstTurn = true;
    let response: any;
    let conversationHistory: any[] = [
        {
            role: 'system',
            content: systemPrompt
        }
    ];

    while (currentTurn < maxTurns) {
        currentTurn++;
        
        try {
            if (isFirstTurn) {
                // Add the user's initial prompt to the conversation
                conversationHistory.push({
                    role: 'user',
                    content: task.prompt
                });

                // Initial turn with the original prompt
                response = await openai.chat.completions.create({
                    model: "gpt-4.1-mini",
                    messages: conversationHistory,
                });
                
                isFirstTurn = false;
            } else {
                // Subsequent turns based on previous action results
                response = await openai.chat.completions.create({
                    model: "gpt-4.1-mini",
                    messages: conversationHistory,
                });
            }

            const message = response.choices[0].message;

            // Add AI's response to history
            conversationHistory.push(message);

            // Check if a command was called for
            if (message.content && message.content.includes("command") && 
                /\(([^)]*command[^)]*)\)/i.test(message.content)) { // If the response contains a command that is wrapped in parentheses, execute
                const cleanedCommand = message.content.match(/\(([^)]*command[^)]*)\)/i)?.[1] || message.content; // Extract the raw command
                const commandResult = await executeCommand(cleanedCommand);

                // Add command result to history for the next turn
                conversationHistory.push({
                    role: 'user', // or 'tool' if you have a more complex setup
                    content: `Command output: ${commandResult}`
                });
            } else {
                // If no command, maybe the task is done or it's waiting for user input
                // For now, we'll just log and continue
                console.log("No command found in response:", message.content);
            }
            
        } catch (error) {
            console.error(`Error on turn ${currentTurn}:`, error);
            throw error;
        }
    }
    
}