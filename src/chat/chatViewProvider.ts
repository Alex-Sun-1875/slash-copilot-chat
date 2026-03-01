import * as vscode from 'vscode';
import { ChatService } from './chatService';

/**
 * Message types for Webview communication
 */
interface WebviewMessage {
    type: string;
    content?: string;
    id?: string;
    [key: string]: unknown;
}

/**
 * Chat View Provider for the sidebar webview
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'slash-copilot.chatView';

    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private chatService: ChatService;

    constructor(extensionUri: vscode.Uri, chatService: ChatService) {
        this._extensionUri = extensionUri;
        this.chatService = chatService;

        // Set up message callback for streaming responses
        this.chatService.setMessageCallback((content, done) => {
            this.postMessage({
                type: 'streamResponse',
                content,
                done
            });
        });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
            switch (message.type) {
                case 'sendMessage':
                    if (message.content) {
                        try {
                            await this.chatService.sendMessage(message.content);
                        } catch (error) {
                            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                            this.postMessage({
                                type: 'error',
                                content: errorMsg
                            });
                        }
                    }
                    break;
                case 'cancelRequest':
                    this.chatService.cancel();
                    break;
                case 'clearChat':
                    this.chatService.clearHistory();
                    break;
                case 'getMessages':
                    this.postMessage({
                        type: 'messagesHistory',
                        messages: this.chatService.getMessages()
                    });
                    break;
            }
        });
    }

    /**
     * Post a message to the webview
     */
    public postMessage(message: WebviewMessage) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    /**
     * Get the HTML content for the webview
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Generate nonce for security
        const nonce = this._getNonce();

        return /*html*/`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Slash Copilot Chat</title>
    <style>
        :root {
            --container-padding: 12px;
            --input-padding: 8px;
        }
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .container {
            display: flex;
            flex-direction: column;
            height: 100%;
            padding: var(--container-padding);
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 8px;
        }
        .header-title {
            font-weight: 600;
            font-size: 13px;
        }
        .header-actions button {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 3px;
        }
        .header-actions button:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }
        .messages-container {
            flex: 1;
            overflow-y: auto;
            padding-right: 4px;
        }
        .message {
            margin-bottom: 16px;
            animation: fadeIn 0.2s ease-in;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .message-header {
            display: flex;
            align-items: center;
            margin-bottom: 6px;
        }
        .message-role {
            font-weight: 600;
            font-size: 12px;
            text-transform: uppercase;
            color: var(--vscode-textPreformat-foreground);
        }
        .message-role.user {
            color: var(--vscode-textLink-foreground);
        }
        .message-role.assistant {
            color: var(--vscode-charts-green);
        }
        .message-content {
            line-height: 1.5;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .message-content code {
            font-family: var(--vscode-editor-font-family);
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 0.9em;
        }
        .message-content pre {
            background: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 8px 0;
        }
        .message-content pre code {
            background: transparent;
            padding: 0;
        }
        .input-container {
            border-top: 1px solid var(--vscode-panel-border);
            padding-top: 12px;
        }
        .input-wrapper {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        textarea {
            width: 100%;
            min-height: 60px;
            max-height: 200px;
            padding: var(--input-padding);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            resize: vertical;
        }
        textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        textarea::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
        .button-row {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
        button {
            padding: 6px 14px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-family: var(--vscode-font-family);
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .loading {
            display: inline-block;
            width: 12px;
            height: 12px;
            border: 2px solid var(--vscode-foreground);
            border-radius: 50%;
            border-top-color: transparent;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            padding: 20px;
        }
        .empty-state h3 {
            margin-bottom: 8px;
            font-weight: 500;
        }
        .empty-state p {
            font-size: 12px;
            line-height: 1.4;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <span class="header-title">Chat</span>
            <div class="header-actions">
                <button id="newChatBtn" title="New Chat">New Chat</button>
            </div>
        </div>
        <div class="messages-container" id="messagesContainer">
            <div class="empty-state" id="emptyState">
                <h3>Start a conversation</h3>
                <p>Ask questions about your code, get explanations, or request help with programming tasks.</p>
            </div>
        </div>
        <div class="input-container">
            <div class="input-wrapper">
                <textarea 
                    id="messageInput" 
                    placeholder="Ask a question..." 
                    rows="3"
                ></textarea>
                <div class="button-row">
                    <button id="cancelBtn" class="secondary" style="display: none;">Cancel</button>
                    <button id="sendBtn">Send</button>
                </div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            
            const messagesContainer = document.getElementById('messagesContainer');
            const emptyState = document.getElementById('emptyState');
            const messageInput = document.getElementById('messageInput');
            const sendBtn = document.getElementById('sendBtn');
            const cancelBtn = document.getElementById('cancelBtn');
            const newChatBtn = document.getElementById('newChatBtn');
            
            let isLoading = false;
            let currentAssistantMessage = null;
            
            // Handle keyboard shortcuts
            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
            
            sendBtn.addEventListener('click', sendMessage);
            cancelBtn.addEventListener('click', () => {
                vscode.postMessage({ type: 'cancelRequest' });
            });
            newChatBtn.addEventListener('click', () => {
                vscode.postMessage({ type: 'clearChat' });
                clearMessages();
            });
            
            function sendMessage() {
                const content = messageInput.value.trim();
                if (!content || isLoading) return;
                
                addMessage('user', content);
                messageInput.value = '';
                setLoading(true);
                
                // Create placeholder for assistant response
                currentAssistantMessage = addMessage('assistant', '');
                
                vscode.postMessage({ type: 'sendMessage', content });
            }
            
            function addMessage(role, content) {
                if (emptyState) {
                    emptyState.style.display = 'none';
                }
                
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message';
                messageDiv.innerHTML = \`
                    <div class="message-header">
                        <span class="message-role \${role}">\${role}</span>
                    </div>
                    <div class="message-content">\${formatContent(content)}</div>
                \`;
                
                messagesContainer.appendChild(messageDiv);
                scrollToBottom();
                
                return messageDiv;
            }
            
            function updateAssistantMessage(content) {
                if (currentAssistantMessage) {
                    const contentDiv = currentAssistantMessage.querySelector('.message-content');
                    if (contentDiv) {
                        contentDiv.innerHTML = formatContent(content);
                        scrollToBottom();
                    }
                }
            }
            
            function formatContent(content) {
                if (!content) return '<span class="loading"></span>';
                
                // Basic markdown-like formatting
                let formatted = escapeHtml(content);
                
                // Code blocks
                formatted = formatted.replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>');
                
                // Inline code
                formatted = formatted.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
                
                // Bold
                formatted = formatted.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
                
                // Line breaks
                formatted = formatted.replace(/\\n/g, '<br>');
                
                return formatted;
            }
            
            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }
            
            function setLoading(loading) {
                isLoading = loading;
                sendBtn.disabled = loading;
                cancelBtn.style.display = loading ? 'block' : 'none';
            }
            
            function scrollToBottom() {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
            
            function clearMessages() {
                messagesContainer.innerHTML = \`
                    <div class="empty-state" id="emptyState">
                        <h3>Start a conversation</h3>
                        <p>Ask questions about your code, get explanations, or request help with programming tasks.</p>
                    </div>
                \`;
                currentAssistantMessage = null;
            }
            
            // Handle messages from extension
            window.addEventListener('message', (event) => {
                const message = event.data;
                
                switch (message.type) {
                    case 'streamResponse':
                        updateAssistantMessage(message.content);
                        if (message.done) {
                            setLoading(false);
                            currentAssistantMessage = null;
                        }
                        break;
                    case 'error':
                        updateAssistantMessage('Error: ' + message.content);
                        setLoading(false);
                        currentAssistantMessage = null;
                        break;
                    case 'clearChat':
                        clearMessages();
                        break;
                    case 'messagesHistory':
                        // Load message history
                        clearMessages();
                        if (message.messages && message.messages.length > 0) {
                            message.messages.forEach(msg => {
                                if (msg.role !== 'system') {
                                    addMessage(msg.role, msg.content);
                                }
                            });
                        }
                        break;
                }
            });
            
            // Request message history on load
            vscode.postMessage({ type: 'getMessages' });
        })();
    </script>
</body>
</html>`;
    }

    /**
     * Generate a random nonce for CSP
     */
    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
