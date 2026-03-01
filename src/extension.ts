import * as vscode from 'vscode';
import { ChatViewProvider } from './chat/chatViewProvider';
import { ChatService } from './chat/chatService';
import { InlineCompletionProvider } from './completion/inlineCompletionProvider';
import { ContextCollector } from './context/contextCollector';
import { CodeActionsProvider } from './actions/codeActions';
import { ProviderFactory } from './providers/factory';

let chatService: ChatService;
let inlineCompletionProvider: InlineCompletionProvider;
let inlineCompletionDisposable: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Slash Copilot Chat is now active!');

    // Initialize services
    const contextCollector = new ContextCollector();
    chatService = new ChatService(contextCollector);
    
    // Register Chat View Provider
    const chatViewProvider = new ChatViewProvider(context.extensionUri, chatService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'slash-copilot.chatView',
            chatViewProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

    // Register Code Actions Provider
    const codeActionsProvider = new CodeActionsProvider(chatService, chatViewProvider);
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            { scheme: 'file' },
            codeActionsProvider,
            {
                providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.Refactor]
            }
        )
    );

    // Register commands
    registerCommands(context, chatService, chatViewProvider, codeActionsProvider);

    // Register inline completion provider
    registerInlineCompletion(context, contextCollector);

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('slash-copilot')) {
                // Re-register inline completion if setting changed
                if (e.affectsConfiguration('slash-copilot.completion.enabled')) {
                    registerInlineCompletion(context, contextCollector);
                }
                // Notify provider factory to refresh
                ProviderFactory.refresh();
            }
        })
    );
}

function registerCommands(
    context: vscode.ExtensionContext,
    chatService: ChatService,
    chatViewProvider: ChatViewProvider,
    codeActionsProvider: CodeActionsProvider
) {
    // Open Chat
    context.subscriptions.push(
        vscode.commands.registerCommand('slash-copilot.openChat', () => {
            vscode.commands.executeCommand('slash-copilot.chatView.focus');
        })
    );

    // New Chat
    context.subscriptions.push(
        vscode.commands.registerCommand('slash-copilot.newChat', () => {
            chatService.clearHistory();
            chatViewProvider.postMessage({ type: 'clearChat' });
        })
    );

    // Explain Code
    context.subscriptions.push(
        vscode.commands.registerCommand('slash-copilot.explainCode', () => {
            codeActionsProvider.executeAction('explain');
        })
    );

    // Optimize Code
    context.subscriptions.push(
        vscode.commands.registerCommand('slash-copilot.optimizeCode', () => {
            codeActionsProvider.executeAction('optimize');
        })
    );

    // Add Comments
    context.subscriptions.push(
        vscode.commands.registerCommand('slash-copilot.addComments', () => {
            codeActionsProvider.executeAction('comment');
        })
    );

    // Generate Tests
    context.subscriptions.push(
        vscode.commands.registerCommand('slash-copilot.generateTests', () => {
            codeActionsProvider.executeAction('test');
        })
    );

    // Fix Code
    context.subscriptions.push(
        vscode.commands.registerCommand('slash-copilot.fixCode', () => {
            codeActionsProvider.executeAction('fix');
        })
    );

    // Toggle Completion
    context.subscriptions.push(
        vscode.commands.registerCommand('slash-copilot.toggleCompletion', async () => {
            const config = vscode.workspace.getConfiguration('slash-copilot');
            const currentValue = config.get<boolean>('completion.enabled', true);
            await config.update('completion.enabled', !currentValue, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(
                `Inline completion ${!currentValue ? 'enabled' : 'disabled'}`
            );
        })
    );
}

function registerInlineCompletion(context: vscode.ExtensionContext, contextCollector: ContextCollector) {
    // Dispose existing provider
    if (inlineCompletionDisposable) {
        inlineCompletionDisposable.dispose();
        const index = context.subscriptions.indexOf(inlineCompletionDisposable);
        if (index > -1) {
            context.subscriptions.splice(index, 1);
        }
    }

    const config = vscode.workspace.getConfiguration('slash-copilot');
    const enabled = config.get<boolean>('completion.enabled', true);

    if (enabled) {
        inlineCompletionProvider = new InlineCompletionProvider(contextCollector);
        inlineCompletionDisposable = vscode.languages.registerInlineCompletionItemProvider(
            { pattern: '**' },
            inlineCompletionProvider
        );
        context.subscriptions.push(inlineCompletionDisposable);
    }
}

export function deactivate() {
    if (inlineCompletionDisposable) {
        inlineCompletionDisposable.dispose();
    }
}
