import * as vscode from 'vscode';
import { ContextCollector } from '../context/contextCollector';
import { ProviderFactory } from '../providers/factory';

/**
 * Inline completion provider for code suggestions
 */
export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
    private contextCollector: ContextCollector;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private lastCompletionTime: number = 0;
    private cachedCompletion: {
        position: vscode.Position;
        document: string;
        completion: string;
    } | null = null;

    constructor(contextCollector: ContextCollector) {
        this.contextCollector = contextCollector;
    }

    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null> {
        // Check if completion is enabled
        const config = vscode.workspace.getConfiguration('slash-copilot');
        if (!config.get<boolean>('completion.enabled', true)) {
            return null;
        }

        // Debounce
        const debounceMs = config.get<number>('completion.debounceMs', 300);
        const now = Date.now();
        if (now - this.lastCompletionTime < debounceMs) {
            return null;
        }

        // Check if we have a cached completion for this position
        if (this.cachedCompletion &&
            this.cachedCompletion.document === document.uri.toString() &&
            this.cachedCompletion.position.isEqual(position) &&
            this.cachedCompletion.completion) {
            return [new vscode.InlineCompletionItem(this.cachedCompletion.completion)];
        }

        // Clear previous timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Get completion context
        const completionContext = this.contextCollector.getCompletionContext();
        if (!completionContext) {
            return null;
        }

        // Skip if prefix is too short or only whitespace
        const trimmedPrefix = completionContext.prefix.trim();
        if (trimmedPrefix.length < 10) {
            return null;
        }

        // Skip if we're in a comment (basic heuristic)
        const currentLine = document.lineAt(position.line).text;
        if (this.isCommentLine(currentLine, completionContext.languageId)) {
            return null;
        }

        try {
            const provider = ProviderFactory.getProvider();
            const maxTokens = config.get<number>('completion.maxTokens', 256);

            // Request completion
            const completion = await provider.complete(
                completionContext.prefix,
                {
                    suffix: completionContext.suffix,
                    maxTokens,
                    temperature: 0.2,
                    stopSequences: ['\n\n', '```']
                }
            );

            if (token.isCancellationRequested) {
                return null;
            }

            if (!completion || completion.trim().length === 0) {
                return null;
            }

            // Cache the completion
            this.cachedCompletion = {
                position,
                document: document.uri.toString(),
                completion: completion
            };
            this.lastCompletionTime = now;

            // Create inline completion item
            const item = new vscode.InlineCompletionItem(
                completion,
                new vscode.Range(position, position)
            );

            return [item];
        } catch (error) {
            // Silently fail for completion errors
            console.error('Completion error:', error);
            return null;
        }
    }

    /**
     * Check if a line is a comment
     */
    private isCommentLine(line: string, languageId: string): boolean {
        const trimmed = line.trim();
        
        // Common comment patterns
        const commentPatterns: Record<string, string[]> = {
            'javascript': ['//', '/*', '*'],
            'typescript': ['//', '/*', '*'],
            'python': ['#', '"""', "'''"],
            'java': ['//', '/*', '*'],
            'c': ['//', '/*', '*'],
            'cpp': ['//', '/*', '*'],
            'csharp': ['//', '/*', '*'],
            'go': ['//', '/*', '*'],
            'rust': ['//', '/*', '*'],
            'ruby': ['#'],
            'php': ['//', '/*', '*', '#'],
            'html': ['<!--'],
            'css': ['/*', '*'],
            'scss': ['//', '/*', '*'],
            'shell': ['#'],
            'bash': ['#'],
            'yaml': ['#'],
            'toml': ['#'],
        };

        const patterns = commentPatterns[languageId] || ['//', '#', '/*', '*'];
        return patterns.some(pattern => trimmed.startsWith(pattern));
    }

    /**
     * Clear the completion cache
     */
    clearCache(): void {
        this.cachedCompletion = null;
    }
}
