import * as vscode from 'vscode';
import { AIProvider } from './base';
import { OpenAIProvider } from './openai';
import { AzureOpenAIProvider } from './azure';
import { CustomProvider } from './custom';

/**
 * Factory for creating AI providers based on configuration
 */
export class ProviderFactory {
    private static instance: AIProvider | null = null;

    /**
     * Get the current AI provider based on settings
     */
    static getProvider(): AIProvider {
        if (!this.instance) {
            this.instance = this.createProvider();
        }
        return this.instance;
    }

    /**
     * Refresh the provider instance (call when settings change)
     */
    static refresh(): void {
        if (this.instance) {
            this.instance.cancel();
        }
        this.instance = null;
    }

    /**
     * Create a new provider based on current settings
     */
    private static createProvider(): AIProvider {
        const config = vscode.workspace.getConfiguration('slash-copilot');
        const providerType = config.get<string>('provider', 'openai');

        switch (providerType) {
            case 'azure':
                return this.createAzureProvider(config);
            case 'custom':
                return this.createCustomProvider(config);
            case 'openai':
            default:
                return this.createOpenAIProvider(config);
        }
    }

    private static createOpenAIProvider(config: vscode.WorkspaceConfiguration): AIProvider {
        const apiKey = config.get<string>('openai.apiKey', '');
        const baseUrl = config.get<string>('openai.baseUrl', 'https://api.openai.com/v1');
        const model = config.get<string>('openai.model', 'gpt-4');

        if (!apiKey) {
            vscode.window.showWarningMessage(
                'OpenAI API key not configured. Please set "slash-copilot.openai.apiKey" in settings.',
                'Open Settings'
            ).then(selection => {
                if (selection === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'slash-copilot.openai.apiKey');
                }
            });
        }

        return new OpenAIProvider(apiKey, baseUrl, model);
    }

    private static createAzureProvider(config: vscode.WorkspaceConfiguration): AIProvider {
        const endpoint = config.get<string>('azure.endpoint', '');
        const apiKey = config.get<string>('azure.apiKey', '');
        const deploymentName = config.get<string>('azure.deploymentName', '');
        const apiVersion = config.get<string>('azure.apiVersion', '2024-02-15-preview');

        if (!endpoint || !apiKey || !deploymentName) {
            vscode.window.showWarningMessage(
                'Azure OpenAI not fully configured. Please set endpoint, API key, and deployment name in settings.',
                'Open Settings'
            ).then(selection => {
                if (selection === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'slash-copilot.azure');
                }
            });
        }

        return new AzureOpenAIProvider(endpoint, apiKey, deploymentName, apiVersion);
    }

    private static createCustomProvider(config: vscode.WorkspaceConfiguration): AIProvider {
        const endpoint = config.get<string>('custom.endpoint', 'http://localhost:11434/v1');
        const apiKey = config.get<string>('custom.apiKey', '');
        const model = config.get<string>('custom.model', 'llama2');

        return new CustomProvider(endpoint, apiKey, model);
    }

    /**
     * Test the current provider connection
     */
    static async testConnection(): Promise<boolean> {
        const provider = this.getProvider();
        return provider.testConnection();
    }
}
