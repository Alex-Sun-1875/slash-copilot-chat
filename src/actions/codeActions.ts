import * as vscode from 'vscode';
import { ChatService } from '../chat/chatService';
import { ChatViewProvider } from '../chat/chatViewProvider';

/**
 * Code action types
 */
export type CodeActionType = 'explain' | 'optimize' | 'comment' | 'test' | 'fix';

/**
 * Code Actions Provider for editor context menu and quick fixes
 */
export class CodeActionsProvider implements vscode.CodeActionProvider {
    private chatService: ChatService;
    private chatViewProvider: ChatViewProvider;

    constructor(chatService: ChatService, chatViewProvider: ChatViewProvider) {
        this.chatService = chatService;
        this.chatViewProvider = chatViewProvider;
    }

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        _token: vscode.CancellationToken
    ): vscode.CodeAction[] | undefined {
        // Only provide actions if there's a selection
        if (range.isEmpty) {
            return undefined;
        }

        const actions: vscode.CodeAction[] = [];

        // Explain Code action
        const explainAction = new vscode.CodeAction(
            'Explain Code',
            vscode.CodeActionKind.RefactorExtract
        );
        explainAction.command = {
            command: 'slash-copilot.explainCode',
            title: 'Explain Code'
        };
        actions.push(explainAction);

        // Optimize Code action
        const optimizeAction = new vscode.CodeAction(
            'Optimize Code',
            vscode.CodeActionKind.RefactorRewrite
        );
        optimizeAction.command = {
            command: 'slash-copilot.optimizeCode',
            title: 'Optimize Code'
        };
        actions.push(optimizeAction);

        // Add Comments action
        const commentAction = new vscode.CodeAction(
            'Add Comments',
            vscode.CodeActionKind.RefactorRewrite
        );
        commentAction.command = {
            command: 'slash-copilot.addComments',
            title: 'Add Comments'
        };
        actions.push(commentAction);

        // Generate Tests action
        const testAction = new vscode.CodeAction(
            'Generate Tests',
            vscode.CodeActionKind.RefactorExtract
        );
        testAction.command = {
            command: 'slash-copilot.generateTests',
            title: 'Generate Tests'
        };
        actions.push(testAction);

        // Fix Code action - add if there are diagnostics
        if (context.diagnostics && context.diagnostics.length > 0) {
            const fixAction = new vscode.CodeAction(
                'Fix Code Issues',
                vscode.CodeActionKind.QuickFix
            );
            fixAction.command = {
                command: 'slash-copilot.fixCode',
                title: 'Fix Code Issues'
            };
            fixAction.diagnostics = context.diagnostics;
            fixAction.isPreferred = true;
            actions.push(fixAction);
        }

        return actions;
    }

    /**
     * Execute a code action
     */
    async executeAction(action: CodeActionType): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage('Please select some code first');
            return;
        }

        const document = editor.document;
        const selectedCode = document.getText(selection);
        const languageId = document.languageId;

        // Get diagnostics for the selection if fixing
        let diagnostics: string | undefined;
        if (action === 'fix') {
            const selectionDiagnostics = vscode.languages
                .getDiagnostics(document.uri)
                .filter(d => selection.contains(d.range) || selection.intersection(d.range));
            
            if (selectionDiagnostics.length > 0) {
                diagnostics = selectionDiagnostics
                    .map(d => `- ${d.message} (${d.source || 'unknown'})`)
                    .join('\n');
            }
        }

        // Focus the chat view
        await vscode.commands.executeCommand('slash-copilot.chatView.focus');

        // Send the action to chat service
        try {
            await this.chatService.executeCodeAction(
                action,
                selectedCode,
                languageId,
                diagnostics
            );
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Error: ${errorMsg}`);
        }
    }

    /**
     * Apply code from AI response to editor
     */
    async applyCodeChange(
        editor: vscode.TextEditor,
        newCode: string,
        range: vscode.Range
    ): Promise<boolean> {
        try {
            // Show diff before applying
            const document = editor.document;
            const originalCode = document.getText(range);

            // Create a simple diff view
            const answer = await vscode.window.showInformationMessage(
                'Apply the suggested code change?',
                { modal: true },
                'Apply',
                'Cancel'
            );

            if (answer === 'Apply') {
                await editor.edit(editBuilder => {
                    editBuilder.replace(range, newCode);
                });
                return true;
            }

            return false;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to apply change: ${errorMsg}`);
            return false;
        }
    }

    /**
     * Extract code blocks from AI response
     */
    extractCodeBlocks(response: string): string[] {
        const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
        const blocks: string[] = [];
        let match;

        while ((match = codeBlockRegex.exec(response)) !== null) {
            blocks.push(match[1].trim());
        }

        return blocks;
    }
}
