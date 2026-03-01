import { AIProvider, Message, ChatOptions, CompleteOptions, OpenAIChatResponse } from './base';

/**
 * Custom API Provider implementation (OpenAI-compatible)
 * Supports Ollama, LM Studio, and other OpenAI-compatible APIs
 */
export class CustomProvider extends AIProvider {
    private endpoint: string;
    private apiKey: string;
    private model: string;

    constructor(endpoint: string, apiKey: string = '', model: string = 'llama2') {
        super();
        this.endpoint = endpoint.replace(/\/$/, '');
        this.apiKey = apiKey;
        this.model = model;
    }

    getName(): string {
        return 'Custom API';
    }

    private getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        return headers;
    }

    async *chat(messages: Message[], options?: ChatOptions): AsyncGenerator<string, void, unknown> {
        this.abortController = new AbortController();

        const response = await fetch(`${this.endpoint}/chat/completions`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                model: options?.model || this.model,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                temperature: options?.temperature ?? 0.7,
                max_tokens: options?.maxTokens ?? 2048,
                stream: true,
                stop: options?.stopSequences
            }),
            signal: this.abortController.signal
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Custom API error: ${response.status} - ${error}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;
                    if (!trimmed.startsWith('data: ')) continue;

                    try {
                        const json: OpenAIChatResponse = JSON.parse(trimmed.slice(6));
                        const content = json.choices[0]?.delta?.content;
                        if (content) {
                            yield content;
                        }
                    } catch {
                        // Skip invalid JSON lines
                    }
                }
            }
        } finally {
            reader.releaseLock();
            this.abortController = null;
        }
    }

    async complete(prompt: string, options?: CompleteOptions): Promise<string> {
        this.abortController = new AbortController();

        const messages: Message[] = [
            {
                role: 'system',
                content: 'You are a code completion assistant. Complete the code naturally and concisely. Only output the completion, no explanations.'
            },
            {
                role: 'user',
                content: options?.suffix
                    ? `Complete the code between <CURSOR>:\n\n${prompt}<CURSOR>${options.suffix}\n\nOnly output the code that goes at <CURSOR>.`
                    : `Complete this code:\n\n${prompt}`
            }
        ];

        try {
            const response = await fetch(`${this.endpoint}/chat/completions`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    model: options?.model || this.model,
                    messages,
                    temperature: options?.temperature ?? 0.2,
                    max_tokens: options?.maxTokens ?? 256,
                    stop: options?.stopSequences
                }),
                signal: this.abortController.signal
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Custom API error: ${response.status} - ${error}`);
            }

            const data: OpenAIChatResponse = await response.json();
            return data.choices[0]?.message?.content || '';
        } finally {
            this.abortController = null;
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            // Try to get models list or make a minimal request
            const response = await fetch(`${this.endpoint}/models`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            
            if (response.ok) {
                return true;
            }

            // Fallback: try a minimal chat request
            const chatResponse = await fetch(`${this.endpoint}/chat/completions`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    model: this.model,
                    messages: [{ role: 'user', content: 'test' }],
                    max_tokens: 1
                })
            });
            return chatResponse.ok;
        } catch {
            return false;
        }
    }
}
