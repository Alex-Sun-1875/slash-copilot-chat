import * as vscode from 'vscode';

/**
 * Code context information
 */
export interface CodeContext {
    /** Current file path */
    filePath: string;
    /** Programming language ID */
    languageId: string;
    /** Full file content */
    fileContent: string;
    /** Selected code (if any) */
    selectedCode?: string;
    /** Selection range */
    selectionRange?: {
        startLine: number;
        endLine: number;
        startColumn: number;
        endColumn: number;
    };
    /** Code before cursor */
    codeBefore: string;
    /** Code after cursor */
    codeAfter: string;
    /** Current line content */
    currentLine: string;
    /** Cursor position */
    cursorPosition: {
        line: number;
        column: number;
    };
    /** Workspace folder name */
    workspaceFolder?: string;
    /** Relative file path from workspace */
    relativePath?: string;
}

/**
 * Collector for gathering code context from the editor
 */
export class ContextCollector {
    /**
     * Get the current code context from the active editor
     */
    getCurrentContext(): CodeContext | null {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }

        const document = editor.document;
        const selection = editor.selection;
        const position = selection.active;

        // Get workspace info
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        const relativePath = workspaceFolder
            ? vscode.workspace.asRelativePath(document.uri, false)
            : undefined;

        // Get full document content
        const fileContent = document.getText();

        // Get selected code
        const selectedCode = selection.isEmpty
            ? undefined
            : document.getText(selection);

        // Get selection range
        const selectionRange = selection.isEmpty
            ? undefined
            : {
                startLine: selection.start.line + 1,
                endLine: selection.end.line + 1,
                startColumn: selection.start.character + 1,
                endColumn: selection.end.character + 1
            };

        // Get code before and after cursor
        const beforeRange = new vscode.Range(
            new vscode.Position(0, 0),
            position
        );
        const afterRange = new vscode.Range(
            position,
            new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length)
        );

        const codeBefore = document.getText(beforeRange);
        const codeAfter = document.getText(afterRange);

        // Get current line
        const currentLine = document.lineAt(position.line).text;

        return {
            filePath: document.uri.fsPath,
            languageId: document.languageId,
            fileContent,
            selectedCode,
            selectionRange,
            codeBefore,
            codeAfter,
            currentLine,
            cursorPosition: {
                line: position.line + 1,
                column: position.character + 1
            },
            workspaceFolder: workspaceFolder?.name,
            relativePath
        };
    }

    /**
     * Get context optimized for chat (with token limiting)
     */
    getChatContext(maxTokens: number = 4000): string {
        const context = this.getCurrentContext();
        if (!context) {
            return '';
        }

        const parts: string[] = [];

        // Add file info
        parts.push(`File: ${context.relativePath || context.filePath}`);
        parts.push(`Language: ${context.languageId}`);

        // If there's selected code, prioritize it
        if (context.selectedCode) {
            parts.push('\n--- Selected Code ---');
            parts.push(context.selectedCode);
            parts.push(`\n(Lines ${context.selectionRange?.startLine}-${context.selectionRange?.endLine})`);
        } else {
            // Otherwise include relevant file content around cursor
            const contextLines = this.getContextAroundCursor(context, maxTokens);
            parts.push('\n--- Code Context ---');
            parts.push(contextLines);
        }

        return parts.join('\n');
    }

    /**
     * Get context optimized for code completion (FIM format)
     */
    getCompletionContext(maxTokensBefore: number = 1500, maxTokensAfter: number = 500): {
        prefix: string;
        suffix: string;
        languageId: string;
    } | null {
        const context = this.getCurrentContext();
        if (!context) {
            return null;
        }

        // Estimate tokens (rough: 1 token ≈ 4 characters)
        const charsBefore = maxTokensBefore * 4;
        const charsAfter = maxTokensAfter * 4;

        let prefix = context.codeBefore;
        let suffix = context.codeAfter;

        // Trim if too long
        if (prefix.length > charsBefore) {
            // Try to find a good break point (line start)
            const trimmedPrefix = prefix.slice(-charsBefore);
            const lineBreak = trimmedPrefix.indexOf('\n');
            prefix = lineBreak > 0 ? trimmedPrefix.slice(lineBreak + 1) : trimmedPrefix;
        }

        if (suffix.length > charsAfter) {
            // Try to find a good break point (line end)
            const trimmedSuffix = suffix.slice(0, charsAfter);
            const lastLineBreak = trimmedSuffix.lastIndexOf('\n');
            suffix = lastLineBreak > 0 ? trimmedSuffix.slice(0, lastLineBreak) : trimmedSuffix;
        }

        return {
            prefix,
            suffix,
            languageId: context.languageId
        };
    }

    /**
     * Get code context around cursor for chat
     */
    private getContextAroundCursor(context: CodeContext, maxTokens: number): string {
        const lines = context.fileContent.split('\n');
        const cursorLine = context.cursorPosition.line - 1;
        
        // Calculate approximate lines to include
        const avgCharsPerLine = context.fileContent.length / lines.length;
        const maxChars = maxTokens * 4; // Rough estimate
        const maxLines = Math.floor(maxChars / avgCharsPerLine);
        
        // Get lines around cursor
        const halfLines = Math.floor(maxLines / 2);
        let startLine = Math.max(0, cursorLine - halfLines);
        let endLine = Math.min(lines.length - 1, cursorLine + halfLines);

        // If file is small enough, include all
        if (lines.length <= maxLines) {
            startLine = 0;
            endLine = lines.length - 1;
        }

        // Format with line numbers
        const contextLines: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
            const lineNum = i + 1;
            const marker = i === cursorLine ? '>' : ' ';
            contextLines.push(`${marker}${lineNum.toString().padStart(4)}: ${lines[i]}`);
        }

        return contextLines.join('\n');
    }

    /**
     * Format context as a system message for chat
     */
    formatContextMessage(context: CodeContext | null): string {
        if (!context) {
            return '';
        }

        let message = `The user is working on a ${context.languageId} file`;
        if (context.relativePath) {
            message += ` at "${context.relativePath}"`;
        }
        message += '.';

        if (context.selectedCode) {
            message += `\n\nThey have selected the following code (lines ${context.selectionRange?.startLine}-${context.selectionRange?.endLine}):\n\`\`\`${context.languageId}\n${context.selectedCode}\n\`\`\``;
        } else {
            message += `\n\nTheir cursor is at line ${context.cursorPosition.line}, column ${context.cursorPosition.column}.`;
        }

        return message;
    }
}
