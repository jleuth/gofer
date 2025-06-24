export interface Task {
    prompt: string;
    from: 'sms' | 'repl' | 'telegram';
    previousCommands?: string[];
}