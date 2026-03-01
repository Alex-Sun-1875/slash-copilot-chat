import { AIProvider, Message, ChatOptions, CompleteOptions, OpenAIChatResponse } from './base';

/**
 * Azure OpenAI Provider implementation
 */
export class AzureOpenAIProvider extends AIProvider {
    private endpoint: string;
    private apiKey: string;
    private deploymentName: string;
    private apiVersion: string;

    constructor(
        endpoint: string,
        apiKey: string,
        deploymentName: string,
        apiVersion: string = '2024-02-15-preview'
    ) {
        super();
        this.endpoint = endpoint.replace(/\/$/, '');
        this.apiKey = apiKey;
        this.deploymentName = deploymentName;
        this.apiVersion = apiVersion;
    }

    getName(): string {
        return 'Azure OpenAI';
    }

    private getUrl(path: string): string {
        return `${this.endpoint}/openai/deployments/${this.deploymentName}${path}?api-version=${this.apiVersion}`;
    }

    async *chat(messages: Message[], options?: ChatOptions): AsyncGenerator<string, void, unknown> {
        this.abortController = new AbortController();

        const response = await fetch(this.getUrl('/chat/completions'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': this.apiKey
            },
            body: JSON.stringify({
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
            throw new Error(`Azure OpenAI API error: ${response.status} - ${error}`);
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
            const response = await fetch(this.getUrl('/chat/completions'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': this.apiKey
                },
                body: JSON.stringify({
                    messages,
                    temperature: options?.temperature ?? 0.2,
                    max_tokens: options?.maxTokens ?? 256,
                    stop: options?.stopSequences
                }),
                signal: this.abortController.signal
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Azure OpenAI API error: ${response.status} - ${error}`);
            }

            const data: OpenAIChatResponse = await response.json();
            return data.choices[0]?.message?.content || '';
        } finally {
            this.abortController = null;
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            // Test by making a minimal chat request
            const messages: Message[] = [{ role: 'user', content: 'test' }];
            const response = await fetch(this.getUrl('/chat/completions'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': this.apiKey
                },
                body: JSON.stringify({
                    messages,
                    max_tokens: 1
                })
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}
