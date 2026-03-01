/**
 * AI Provider base interfaces and types
 */

export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stopSequences?: string[];
}

export interface CompleteOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stopSequences?: string[];
    suffix?: string; // For FIM (Fill-in-the-Middle)
}

export interface StreamChunk {
    content: string;
    done: boolean;
}

/**
 * Abstract base class for AI providers
 */
export abstract class AIProvider {
    protected abortController: AbortController | null = null;

    /**
     * Send chat messages and receive streaming response
     */
    abstract chat(messages: Message[], options?: ChatOptions): AsyncGenerator<string, void, unknown>;

    /**
     * Complete code based on prompt (and optional suffix for FIM)
     */
    abstract complete(prompt: string, options?: CompleteOptions): Promise<string>;

    /**
     * Cancel ongoing request
     */
    cancel(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    /**
     * Test connection to the provider
     */
    abstract testConnection(): Promise<boolean>;

    /**
     * Get provider name
     */
    abstract getName(): string;
}

/**
 * OpenAI API response types
 */
export interface OpenAIChatResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        message?: {
            role: string;
            content: string;
        };
        delta?: {
            role?: string;
            content?: string;
        };
        finish_reason: string | null;
    }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface OpenAICompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        text: string;
        index: number;
        finish_reason: string;
    }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * Provider configuration interface
 */
export interface ProviderConfig {
    type: 'openai' | 'azure' | 'custom';
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    deploymentName?: string;
    apiVersion?: string;
}
