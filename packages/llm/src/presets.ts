import type {ProviderConfig} from './types.ts';
export const OLLAMA_CLOUD_BASE_URL='https://ollama.com/v1';
export const OLLAMA_CLOUD_MODELS_URL='https://ollama.com/api/tags';
export const isOllamaCloudRoute=(config:ProviderConfig)=>config.api==='openai-completions'&&config.baseURL?.replace(/\/+$/,'')===OLLAMA_CLOUD_BASE_URL;
export const apiPresets=[{id:'ollama-cloud',title:'Ollama Cloud',api:'openai-completions',baseURL:OLLAMA_CLOUD_BASE_URL,requiresKey:true}] as const;
