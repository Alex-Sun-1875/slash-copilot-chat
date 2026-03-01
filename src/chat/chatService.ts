import * as vscode from 'vscode';
import { Message } from '../providers/base';
import { ProviderFactory } from '../providers/factory';
import { ContextCollector } from '../context/contextCollector';

/**
 * Chat session with message history
 */
export interface ChatSession {
    id: string;
    messages: Message[];
    createdAt: number;
    title?: string;
}

/**
 * Chat service for managing conversations with AI
 */
export class ChatService {
    private contextCollector: ContextCollector;
    private currentSession: ChatSession;
    private onMessageCallback: ((content: string, done: boolean) => void) | null = null;

    constructor(contextCollector: ContextCollector) {
        this.contextCollector = contextCollector;
        this.currentSession = this.createNewSession();
    }

    /**
     * Create a new chat session
     */
    private createNewSession(): ChatSession {
        return {
            id: this.generateId(),
            messages: [],
            createdAt: Date.now()
        };
    }

    /**
     * Generate a unique session ID
     */
    private generateId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * Clear chat history and start new session
     */
    clearHistory(): void {
        this.currentSession = this.createNewSession();
    }

    /**
     * Get current session messages
     */
    getMessages(): Message[] {
        return [...this.currentSession.messages];
    }

    /**
     * Set callback for streaming messages
     */
    setMessageCallback(callback: ((content: string, done: boolean) => void) | null): void {
        this.onMessageCallback = callback;
    }

    /**
     * Send a message and get streaming response
     */
    async sendMessage(userMessage: string, includeContext: boolean = true): Promise<string> {
        const provider = ProviderFactory.getProvider();
        const config = vscode.workspace.getConfiguration('slash-copilot');
        const systemPrompt = config.get<string>(
            'chat.systemPrompt',
            'You are a helpful coding assistant. Help the user with their programming questions and tasks. When providing code, be concise and explain your reasoning.'
        );

        // Build messages array
        const messages: Message[] = [];

        // Add system prompt
        messages.push({
            role: 'system',
            content: systemPrompt
        });

        // Add code context if enabled
        if (includeContext) {
            const context = this.contextCollector.getCurrentContext();
            if (context) {
                const contextMessage = this.contextCollector.formatContextMessage(context);
                if (contextMessage) {
                    messages.push({
                        role: 'system',
                        content: contextMessage
                    });
                }
            }
        }

        // Add conversation history
        messages.push(...this.currentSession.messages);

        // Add new user message
        const newUserMessage: Message = {
            role: 'user',
            content: userMessage
        };
        messages.push(newUserMessage);

        // Store user message in history
        this.currentSession.messages.push(newUserMessage);

        // Generate response
        let fullResponse = '';
        try {
            const stream = provider.chat(messages);
            for await (const chunk of stream) {
                fullResponse += chunk;
                if (this.onMessageCallback) {
                    this.onMessageCallback(fullResponse, false);
                }
            }

            // Store assistant response in history
            const assistantMessage: Message = {
                role: 'assistant',
                content: fullResponse
            };
            this.currentSession.messages.push(assistantMessage);

            if (this.onMessageCallback) {
                this.onMessageCallback(fullResponse, true);
            }

            // Update session title if first message
            if (!this.currentSession.title && this.currentSession.messages.length === 2) {
                this.currentSession.title = this.generateTitle(userMessage);
            }

            return fullResponse;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            if (this.onMessageCallback) {
                this.onMessageCallback(`Error: ${errorMessage}`, true);
            }
            throw error;
        }
    }

    /**
     * Cancel ongoing request
     */
    cancel(): void {
        const provider = ProviderFactory.getProvider();
        provider.cancel();
    }

    /**
     * Generate a title for the session from the first message
     */
    private generateTitle(firstMessage: string): string {
        // Take first 50 characters and clean up
        let title = firstMessage.slice(0, 50);
        if (firstMessage.length > 50) {
            title += '...';
        }
        return title.replace(/\n/g, ' ').trim();
    }

    /**
     * Execute a code action with the selected code
     */
    async executeCodeAction(
        action: 'explain' | 'optimize' | 'comment' | 'test' | 'fix',
        code: string,
        languageId: string,
        diagnostics?: string
    ): Promise<string> {
        const prompts: Record<string, string> = {
            explain: `Please explain the following ${languageId} code:\n\n\`\`\`${languageId}\n${code}\n\`\`\`\n\nProvide a clear, concise explanation of what this code does.`,
            optimize: `Please optimize the following ${languageId} code for better performance and readability:\n\n\`\`\`${languageId}\n${code}\n\`\`\`\n\nProvide the optimized code with explanations of the improvements.`,
            comment: `Please add clear and helpful comments to the following ${languageId} code:\n\n\`\`\`${languageId}\n${code}\n\`\`\`\n\nReturn the code with appropriate comments added.`,
            test: `Please generate unit tests for the following ${languageId} code:\n\n\`\`\`${languageId}\n${code}\n\`\`\`\n\nProvide comprehensive test cases using appropriate testing framework for ${languageId}.`,
            fix: diagnostics
                ? `Please fix the following ${languageId} code based on these issues:\n\nIssues:\n${diagnostics}\n\nCode:\n\`\`\`${languageId}\n${code}\n\`\`\`\n\nProvide the fixed code with explanations.`
                : `Please review and fix any issues in the following ${languageId} code:\n\n\`\`\`${languageId}\n${code}\n\`\`\`\n\nProvide the fixed code with explanations of what was wrong.`
        };

        const prompt = prompts[action];
        return this.sendMessage(prompt, false);
    }
}
