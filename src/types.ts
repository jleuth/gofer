
export interface Task {
    prompt: string;
    from: 'sms' | 'repl';
    previousCommands?: string[];
}