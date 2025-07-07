# Using Different AI Models with Gofer

Gofer isn't stuck with just OpenAI anymore! You can now use different AI providers and models. Pretty cool, right?

## What's Available

- **OpenAI** - The usual suspects: GPT-4.1, GPT-4.1-mini, o3, etc.
- **Anthropic** - Claude models (Sonnet 4 is really good!)
- **xAI** - Grok models from Elon's company (yuck)
- **Google** - Gemini models
- **Mistral** - European AI models
- **Together.ai** - Cheap open-source models like Llama
- **OpenRouter** - Access to 100+ models through one API
- **Ollama** - Run models locally on your machine

## How to Use It

### See what's available
```bash
npm run providers list
```

### Switch to a different provider
```bash
# Use Claude (it's really good at reasoning)
npm run providers config anthropic

# Use a specific Claude model
npm run providers config anthropic claude-sonnet-4

# Use OpenRouter to access tons of models
npm run providers config openrouter anthropic/claude-sonnet-4

# Use local Ollama (free but needs models installed)
npm run providers config ollama llama3.2
```

### Check what you're currently using
```bash
npm run providers status
```

### Get a template for environment variables
```bash
npm run providers env-template
```

## Setting Up API Keys

You'll need to add API keys to your `.env.local` file. Don't worry, you only need the keys for providers you actually want to use.

```env
# Just add the ones you plan to use
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
XAI_API_KEY=your_xai_key
GOOGLE_API_KEY=your_google_key
MISTRAL_API_KEY=your_mistral_key
TOGETHER_API_KEY=your_together_key
OPENROUTER_API_KEY=your_openrouter_key
```

## Quick Guide to Each Provider

### OpenAI
- **Good for**: General stuff, coding, the usual
- **Popular models**: `gpt-4.1`, `gpt-4.1-mini`, `o3`
- **Note**: This is the default, so it'll work out of the box

### Anthropic (Claude)
- **Good for**: Really good at reasoning, writing, coding
- **Popular models**: `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`
- **Note**: Claude Sonnet 4 is super good. Pricey, but good.

### xAI (Grok)
- **Good for**: Creative stuff, being a bit cheeky
- **Popular models**: `grok-3`, `grok-3-mini`
- **Note**: It's Elon's AI, so it has personality, and BIAS. Just... don't ask it about politics.

### Google (Gemini)
- **Good for**: Handling images, documents, multimodal tasks
- **Popular models**: `gemini-2.5-pro-latest`, `gemini-2.5-flash-latest`
- **Note**: Pretty good at understanding images

### Mistral
- **Good for**: Privacy-focused, European compliance
- **Popular models**: `mistral-large-3`, `mistral-small-3`
- **Note**: Good alternative to US-based models

### Together.ai
- **Good for**: Cheap access to open-source models
- **Popular models**: `meta-llama/Llama-4-Maverick`
- **Note**: Way cheaper than OpenAI/Anthropic

### OpenRouter
- **Good for**: Access to everything through one API
- **Popular models**: `anthropic/claude-sonnet-4`, `meta-llama/llama-4-maverick`
- **Note**: One API key, access to 100+ models

### Ollama
- **Good for**: Running models locally, totally free
- **Popular models**: `llama3.2`, `deepseek-r1`, `mistral-small-3`
- **Note**: Free but you need to install models first

## Real Examples

### Want Claude to be smarter?
```bash
npm run providers config anthropic
```

### Want to try everything through OpenRouter?
```bash
npm run providers config openrouter meta-llama/llama-4-maverick
```

### Want to use local models for free?
```bash
npm run providers config ollama llama3.2
```

## If Something Breaks

### Provider not working?
1. Make sure you added the right API key to `.env.local`
2. Check the model name is correct with `npm run providers list`
3. See what's going on with `npm run providers status`

### No worries about breaking things
If a provider fails, Gofer automatically falls back to OpenAI. Just make sure you have `OPENAI_API_KEY` set up.

### Common problems
- **Forgot API key**: Add it to `.env.local`
- **Wrong model name**: Check `npm run providers list` for the right names
- **Hit rate limits**: Some providers are stricter than others

## Extra Stuff

### Works with Telegram
Once you configure a provider, it works with the Telegram bot too. Just restart Gofer.

### Separate watcher model
You can use a different (cheaper) model for watching your desktop:
```env
WATCHER_MODEL=gpt-4.1-mini
```

### Money stuff
- **OpenAI**: Expensive but reliable
- **Anthropic**: Pretty reasonable, great for long conversations
- **Together.ai**: Super cheap for open-source models
- **OpenRouter**: One bill for everything
- **Google**: Decent pricing, has free tier
- **Ollama**: Totally free but runs on your computer

Pick whatever fits your budget and needs!