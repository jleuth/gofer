import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { xai } from '@ai-sdk/xai';
import { google } from '@ai-sdk/google';
import { mistral } from '@ai-sdk/mistral';
import { togetherai } from '@ai-sdk/togetherai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { ollama } from 'ollama-ai-provider';
import { aisdk } from '@openai/agents-extensions';

export interface ProviderConfig {
  name: string;
  displayName: string;
  apiKeyEnvVar: string;
  defaultModel: string;
  models: string[];
  requiresApiKey: boolean;
  provider: any;
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  openai: {
    name: 'openai',
    displayName: 'OpenAI',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'],
    requiresApiKey: true,
    provider: openai
  },
  anthropic: {
    name: 'anthropic',
    displayName: 'Anthropic',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-3-5-sonnet-20241022',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
    requiresApiKey: true,
    provider: anthropic
  },
  xai: {
    name: 'xai',
    displayName: 'xAI',
    apiKeyEnvVar: 'XAI_API_KEY',
    defaultModel: 'grok-beta',
    models: ['grok-beta', 'grok-vision-beta'],
    requiresApiKey: true,
    provider: xai
  },
  google: {
    name: 'google',
    displayName: 'Google',
    apiKeyEnvVar: 'GOOGLE_API_KEY',
    defaultModel: 'gemini-1.5-pro-latest',
    models: ['gemini-1.5-pro-latest', 'gemini-1.5-flash-latest', 'gemini-1.0-pro'],
    requiresApiKey: true,
    provider: google
  },
  mistral: {
    name: 'mistral',
    displayName: 'Mistral',
    apiKeyEnvVar: 'MISTRAL_API_KEY',
    defaultModel: 'mistral-large-latest',
    models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'pixtral-large-latest'],
    requiresApiKey: true,
    provider: mistral
  },
  togetherai: {
    name: 'togetherai',
    displayName: 'Together.ai',
    apiKeyEnvVar: 'TOGETHER_API_KEY',
    defaultModel: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
    models: [
      'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
      'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo',
      'meta-llama/Llama-3.2-3B-Instruct-Turbo',
      'Qwen/Qwen2.5-72B-Instruct-Turbo',
      'microsoft/WizardLM-2-8x22B'
    ],
    requiresApiKey: true,
    provider: togetherai
  },
  openrouter: {
    name: 'openrouter',
    displayName: 'OpenRouter',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    models: [
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3.5-haiku',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'google/gemini-pro-1.5',
      'meta-llama/llama-3.2-90b-vision-instruct',
      'microsoft/wizardlm-2-8x22b',
      'qwen/qwen-2.5-72b-instruct'
    ],
    requiresApiKey: true,
    provider: null // Will be initialized dynamically
  },
  ollama: {
    name: 'ollama',
    displayName: 'Ollama (Local)',
    apiKeyEnvVar: 'OLLAMA_HOST',
    defaultModel: 'llama3.2',
    models: [
      'llama3.2',
      'llama3.2:70b',
      'llama3.1',
      'llama3.1:70b',
      'codellama',
      'mistral',
      'qwen2.5',
      'phi3',
      'gemma2'
    ],
    requiresApiKey: false,
    provider: ollama
  }
};

export function getProviderModel(providerName: string, modelName?: string) {
  const config = PROVIDERS[providerName];
  if (!config) {
    throw new Error(`Provider '${providerName}' not found`);
  }

  const model = modelName || config.defaultModel;
  
  // Check if API key is required and available
  if (config.requiresApiKey) {
    const apiKey = process.env[config.apiKeyEnvVar];
    if (!apiKey) {
      throw new Error(`${config.apiKeyEnvVar} environment variable is required for ${config.displayName}`);
    }
  }

  let providerInstance;
  
  if (providerName === 'openrouter') {
    // OpenRouter requires special initialization
    const apiKey = process.env[config.apiKeyEnvVar];
    if (!apiKey) {
      throw new Error(`${config.apiKeyEnvVar} environment variable is required for ${config.displayName}`);
    }
    providerInstance = createOpenRouter({ apiKey });
  } else if (providerName === 'ollama') {
    // Ollama uses default localhost configuration
    providerInstance = ollama;
  } else {
    // Standard AI SDK providers
    providerInstance = config.provider;
  }

  return aisdk(providerInstance(model));
}

// New function for direct AI SDK usage (like in the watcher)
export function getRawProviderModel(providerName: string, modelName?: string) {
  const config = PROVIDERS[providerName];
  if (!config) {
    throw new Error(`Provider '${providerName}' not found`);
  }

  const model = modelName || config.defaultModel;
  
  // Check if API key is required and available
  if (config.requiresApiKey) {
    const apiKey = process.env[config.apiKeyEnvVar];
    if (!apiKey) {
      throw new Error(`${config.apiKeyEnvVar} environment variable is required for ${config.displayName}`);
    }
  }

  let providerInstance;
  
  if (providerName === 'openrouter') {
    // OpenRouter requires special initialization
    const apiKey = process.env[config.apiKeyEnvVar];
    if (!apiKey) {
      throw new Error(`${config.apiKeyEnvVar} environment variable is required for ${config.displayName}`);
    }
    providerInstance = createOpenRouter({ apiKey });
  } else if (providerName === 'ollama') {
    // Ollama uses default localhost configuration
    providerInstance = ollama;
  } else {
    // Standard AI SDK providers
    providerInstance = config.provider;
  }

  // Return raw model without aisdk wrapper for direct AI SDK usage
  return providerInstance(model);
}

export function listProviders(): Array<{ name: string; displayName: string; models: string[] }> {
  return Object.values(PROVIDERS).map(config => ({
    name: config.name,
    displayName: config.displayName,
    models: config.models
  }));
}

export function getProviderConfig(providerName: string): ProviderConfig | null {
  return PROVIDERS[providerName] || null;
}