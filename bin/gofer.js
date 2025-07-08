#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use tsx to run the TypeScript React file
const replPath = join(__dirname, '../src/repl.tsx');
const child = spawn('npx', ['tsx', replPath, ...process.argv.slice(2)], { 
    stdio: 'inherit',
    cwd: join(__dirname, '..')
});

child.on('close', (code) => {
    process.exit(code || 0);
});