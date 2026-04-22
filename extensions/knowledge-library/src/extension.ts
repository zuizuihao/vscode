/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WikiIndex } from './index/wikiIndex';
import { IndexWatcher } from './index/indexWatcher';
import { WikiLinkCompletionProvider } from './wikiLink/completionProvider';
import { WikiLinkDefinitionProvider } from './wikiLink/definitionProvider';
import { WikiLinkHoverProvider } from './wikiLink/hoverProvider';
import { DiagnosticsProvider } from './wikiLink/diagnosticsProvider';
import { SearchProvider } from './search/searchProvider';
import { BacklinksProvider } from './backlinks/backlinksView';
import { GraphPanel } from './graph/graphPanel';
import { WikiTestController } from './testing/wikiTestController';

const MARKDOWN_SELECTOR: vscode.DocumentSelector = { language: 'markdown' };

export interface KnowledgeLibraryExtensionApi {
	readonly index: WikiIndex;
	readonly watcher: IndexWatcher;
	readonly backlinksProvider: BacklinksProvider;
	readonly testController: WikiTestController;
}

let currentApi: KnowledgeLibraryExtensionApi | undefined;

function resolveWikiDir(): vscode.Uri | undefined {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder) {
		return undefined;
	}
	const wikiDir = vscode.workspace
		.getConfiguration('knowledgeLibrary')
		.get<string>('wikiDir', 'wiki');
	return vscode.Uri.joinPath(folder.uri, wikiDir);
}

export async function activate(context: vscode.ExtensionContext): Promise<KnowledgeLibraryExtensionApi | undefined> {
	const wikiDir = resolveWikiDir();
	if (!wikiDir) {
		return;
	}

	const index = new WikiIndex(wikiDir);
	const watcher = new IndexWatcher(index);
	context.subscriptions.push(watcher);

	// Populate index before registering providers.
	await watcher.initialize();

	await vscode.commands.executeCommand('setContext', 'knowledgeLibrary.active', true);

	const searchProvider = new SearchProvider(index, watcher);
	const diagnosticsProvider = new DiagnosticsProvider(index, watcher);
	const backlinksProvider = new BacklinksProvider(index, watcher);
	const testController = new WikiTestController(index, watcher);

	currentApi = {
		index,
		watcher,
		backlinksProvider,
		testController,
	};

	context.subscriptions.push(
		// Wikilink language providers
		vscode.languages.registerCompletionItemProvider(
			MARKDOWN_SELECTOR,
			new WikiLinkCompletionProvider(index),
			'[',
		),
		vscode.languages.registerDefinitionProvider(
			MARKDOWN_SELECTOR,
			new WikiLinkDefinitionProvider(index),
		),
		vscode.languages.registerHoverProvider(
			MARKDOWN_SELECTOR,
			new WikiLinkHoverProvider(index),
		),
		diagnosticsProvider,

		// Search
		vscode.commands.registerCommand(
			'knowledge-library.searchWiki',
			() => searchProvider.run(),
		),
		searchProvider,

		// Graph
		vscode.commands.registerCommand(
			'knowledge-library.showGraph',
			() => GraphPanel.show(context, index, undefined),
		),
		vscode.commands.registerCommand(
			'knowledge-library.showLocalGraph',
			() => {
				const active = vscode.window.activeTextEditor?.document.uri;
				GraphPanel.show(context, index, active);
			},
		),

		// Backlinks tree view
		vscode.window.registerTreeDataProvider(
			'knowledge-library.backlinksView',
			backlinksProvider,
		),
		backlinksProvider,
		testController,
	);

	return currentApi;
}

export function deactivate(): void {
	currentApi = undefined;
	// Nothing to do — disposables are managed via context.subscriptions.
}

export function getCurrentApi(): KnowledgeLibraryExtensionApi | undefined {
	return currentApi;
}
