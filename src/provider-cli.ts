#!/usr/bin/env node

import { Command } from 'commander';
import { listProviders, getProviderConfig } from './providers.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('gofer-providers')
  .description('Manage AI providers for Gofer')
  .version('1.0.0');

program
  .command('list')
  .description('List all available providers and their models')
  .action(() => {
    const providers = listProviders();
    
    console.log('\n🤖 Available AI Providers:\n');
    
    providers.forEach(provider => {
      console.log(`📋 ${provider.displayName} (${provider.name})`);
      console.log(`   Models: ${provider.models.join(', ')}`);
      console.log('');
    });
  });

program
  .command('config')
  .description('Configure the current provider and model')
  .argument('<provider>', 'Provider name (e.g., openai, anthropic, xai)')
  .argument('[model]', 'Model name (optional, uses default if not specified)')
  .action((provider: string, model?: string) => {
    const config = getProviderConfig(provider);
    
    if (!config) {
      console.error(`❌ Provider '${provider}' not found`);
      console.log('\n📋 Available providers:');
      listProviders().forEach(p => console.log(`   - ${p.name}`));
      process.exit(1);
    }
    
    const selectedModel = model || config.defaultModel;
    
    if (!config.models.includes(selectedModel)) {
      console.error(`❌ Model '${selectedModel}' not available for ${config.displayName}`);
      console.log(`\n📋 Available models for ${config.displayName}:`);
      config.models.forEach(m => console.log(`   - ${m}`));
      process.exit(1);
    }
    
    // Update .env.local file
    const envPath = path.join(__dirname, '../.env.local');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Update or add GOFER_PROVIDER
    if (envContent.includes('GOFER_PROVIDER=')) {
      envContent = envContent.replace(/GOFER_PROVIDER=.*/g, `GOFER_PROVIDER=${provider}`);
    } else {
      envContent += `\nGOFER_PROVIDER=${provider}`;
    }
    
    // Update or add GOFER_MODEL
    if (envContent.includes('GOFER_MODEL=')) {
      envContent = envContent.replace(/GOFER_MODEL=.*/g, `GOFER_MODEL=${selectedModel}`);
    } else {
      envContent += `\nGOFER_MODEL=${selectedModel}`;
    }
    
    fs.writeFileSync(envPath, envContent);
    
    console.log(`✅ Configuration updated:`);
    console.log(`   Provider: ${config.displayName}`);
    console.log(`   Model: ${selectedModel}`);
    console.log(`   API Key Variable: ${config.apiKeyEnvVar}`);
    
    if (config.requiresApiKey) {
      const apiKey = process.env[config.apiKeyEnvVar];
      if (!apiKey) {
        console.log(`\n⚠️  Don't forget to set ${config.apiKeyEnvVar} in your .env.local file!`);
      } else {
        console.log(`\n✅ API key is already configured for ${config.displayName}`);
      }
    }
  });

program
  .command('status')
  .description('Show current provider configuration')
  .action(() => {
    const envPath = path.join(__dirname, '../.env.local');
    
    if (!fs.existsSync(envPath)) {
      console.log('❌ No .env.local file found');
      process.exit(1);
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const providerMatch = envContent.match(/GOFER_PROVIDER=(.+)/);
    const modelMatch = envContent.match(/GOFER_MODEL=(.+)/);
    
    const currentProvider = providerMatch ? providerMatch[1] : 'openai';
    const currentModel = modelMatch ? modelMatch[1] : 'gpt-4o-mini';
    
    const config = getProviderConfig(currentProvider);
    
    if (!config) {
      console.log(`❌ Current provider '${currentProvider}' is not valid`);
      process.exit(1);
    }
    
    console.log(`\n🤖 Current Configuration:`);
    console.log(`   Provider: ${config.displayName} (${config.name})`);
    console.log(`   Model: ${currentModel}`);
    console.log(`   API Key Variable: ${config.apiKeyEnvVar}`);
    
    if (config.requiresApiKey) {
      const apiKey = process.env[config.apiKeyEnvVar];
      if (apiKey) {
        console.log(`   API Key: ✅ Configured`);
      } else {
        console.log(`   API Key: ❌ Not found (set ${config.apiKeyEnvVar})`);
      }
    }
  });

program
  .command('env-template')
  .description('Generate environment variable template')
  .action(() => {
    const providers = listProviders();
    
    console.log('\n# AI Provider Configuration for Gofer');
    console.log('# Copy the relevant variables to your .env.local file\n');
    
    console.log('# Current provider and model');
    console.log('GOFER_PROVIDER=openai');
    console.log('GOFER_MODEL=gpt-4o-mini\n');
    
    console.log('# API Keys for different providers');
    Object.values(providers).forEach(provider => {
      const config = getProviderConfig(provider.name);
      if (config?.requiresApiKey) {
        console.log(`${config.apiKeyEnvVar}=your_${provider.name}_api_key_here`);
      }
    });
    
    console.log('\n# Other Gofer settings');
    console.log('WATCHER_MODEL=gpt-4o-mini');
    console.log('ENABLE_COMMAND_EXECUTION=true');
    console.log('ENABLE_WATCHER=true');
    console.log('ENABLE_TELEGRAM=true');
    console.log('ENABLE_LOGGING=true');
    console.log('TELEGRAM_TOKEN=your_telegram_token');
    console.log('CHAT_ID=your_chat_id');
    console.log('PASSCODE=your_passcode');
  });

program.parse();