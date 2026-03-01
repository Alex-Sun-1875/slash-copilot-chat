import { AIProvider, Message, ChatOptions, CompleteOptions, OpenAIChatResponse } from './base';

/**
 * OpenAI Provider implementation
 */
export class OpenAIProvider extends AIProvider {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor(apiKey: string, baseUrl: string = 'https://api.openai.com/v1', model: string = 'gpt-4') {
        super();
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
        this.model = model;
    }

    getName(): string {
        return 'OpenAI';
    }

    async *chat(messages: Message[], options?: ChatOptions): AsyncGenerator<string, void, unknown> {
        this.abortController = new AbortController();

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
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
            throw new Error(`OpenAI API error: ${response.status} - ${error}`);
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

        // Use chat completions API with FIM-style prompt
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
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
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
                throw new Error(`OpenAI API error: ${response.status} - ${error}`);
            }

            const data: OpenAIChatResponse = await response.json();
            return data.choices[0]?.message?.content || '';
        } finally {
            this.abortController = null;
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}
