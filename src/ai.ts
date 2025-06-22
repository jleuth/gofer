import { OpenAI } from "openai";
import { Task } from "./types";

// TODO: Write all the prompts

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function runTask(task: Task, maxTurns = 10) {

    let currentTurn = 0;
    let isFirstTurn = true;

    while (currentTurn < maxTurns) {
        currentTurn++;
        
        try {
            if (isFirstTurn) {
                // Initial turn with the original prompt
                const response = await openai.responses.create({
                    model: "gpt-4.1-mini",
                    input: task.prompt,
                });
                
                isFirstTurn = false;
                // TODO: Process response and determine next action
                
            } else {
                // Subsequent turns based on previous action results
                const response = await openai.responses.create({
                    model: "gpt-4.1-mini",
                    input: task.prompt,
                });
                
            }
            
        } catch (error) {
            console.error(`Error on turn ${currentTurn}:`, error);
            throw error;
        }
    }
    
}