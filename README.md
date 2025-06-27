# Gofer

Gofer is an AI agent that lives on your computer to take care of tasks while you're away. It can execute commands, monitor your desktop for changes, and communicate with you via Telegram or a local REPL interface.

## Features

- **Remote Control**: Control your computer via Telegram bot
- **Desktop Monitoring**: Watch for visual changes on your desktop to detect task completion
- **Command Execution**: Run shell commands with built-in safety protections
- **Interactive REPL**: Local command-line interface for direct interaction
- **Task Context**: Maintains conversation history for follow-up commands
- **Security First**: Commands disabled by default, forbidden command blocking, authentication required

## Prerequisites

- Node.js (v18 or higher)
- Linux system with systemd
- Telegram Bot Token (for remote features)
- KDE Spectacle (for screenshots)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/jleuth/gofer.git
cd gofer
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Set up environment variables by creating `.env.local`. Follow the .env.example to know what to provide.

5. Get your OpenAI API key, follow these instructions to find it. https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key

6. Make your Telegram bot. To do this, you'll just need a Telegram account.
    - 6a. Open a conversation with @BotFather.
    - 6b. Run /newbot, and provide a name for it. The name can be anything you like.
    - 6c. Copy and paste the provided API key into your .env.local file, DO NOT SHARE THIS WITH ANYONE!
    - 6d. Run /mybots, pick your new bot, and click on "Edit Commands"
    - 6e. Copy and paste this list
            ```
            run - Send Gofer a new task to run
            followup - Send a follow-up to the last task
            status - Check the status of a task
            screenshot - Manually grab a screenshot of the desktop
            getfile - Have Gofer send you a file from your computer
            shutdown - Stop the Gofer server on your computer
            help - Show a list of commands
            ```
    - 6f. All done! You can customize the bot to your liking if you want, give it a Blahaj pfp :D. 

7. Install as system service:
```bash
./install.sh
```

## Usage

### Telegram Bot Commands

- `/run <passcode> <task>` - Execute a new task
- `/followup <passcode> <task>` - Continue with context from previous commands
- `/status <passcode>` - Check recent command history
- `/screenshot <passcode>` - Get a desktop screenshot
- `/getfile <passcode> <filepath or path description, the model will find it for you.>` - Download a file from your computer
- `/help` - Show available commands
- `/shutdown` - Stop the Gofer daemon

### Local REPL

Run the interactive command-line interface:
```bash
gofer
```

### Service Management

```bash
# Check service status
systemctl --user status gofer

# Stop the service
systemctl --user stop gofer

# Start the service
systemctl --user start gofer

# View logs
journalctl --user -u gofer -f
```

## Security Features

- **Authentication**: Telegram commands require a passcode, set in .env.local
- **Command Filtering**: Dangerous commands (rm -rf, dd, mkfs, passwd) are blocked
- **Feature Toggles**: All major features can be disabled via environment variables
- **Default Disabled**: Command execution is disabled by default for safety

## Development

```bash
# Run in development mode
npx tsx src/daemon.ts

# Run REPL in development
npx tsx src/repl.tsx

# Build project
npm run build
```

## License

ISC