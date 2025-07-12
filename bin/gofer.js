#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if we're in development (has dist folder) or installed (pre-built)
import { existsSync } from 'fs';

const distPath = join(__dirname, '../dist/repl.js');
const srcPath = join(__dirname, '../src/repl.tsx');

let child;

if (existsSync(distPath)) {
    // Production: use compiled JavaScript
    child = spawn('node', [distPath, ...process.argv.slice(2)], { 
        stdio: 'inherit',
        cwd: join(__dirname, '..')
    });
} else {
    // Development: use TypeScript directly
    child = spawn('npx', ['tsx', srcPath, ...process.argv.slice(2)], { 
        stdio: 'inherit',
        cwd: join(__dirname, '..')
    });
}

child.on('close', (code) => {
    process.exit(code || 0);
});