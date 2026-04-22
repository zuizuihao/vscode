/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WikiIndex } from '../index/wikiIndex';
import { IndexWatcher } from '../index/indexWatcher';
import { BM25Index } from './bm25';

const MAX_DESCRIPTION_LENGTH = 120;

export class SearchProvider implements vscode.Disposable {
	private readonly _bm25 = new BM25Index();
	private readonly _disposables: vscode.Disposable[] = [];

	constructor(
		private readonly _index: WikiIndex,
		watcher: IndexWatcher,
	) {
		this._bm25.setPages(_index.getAllPages());
		this._disposables.push(
			watcher.onDidChange(() => {
				this._bm25.setPages(this._index.getAllPages());
			}),
		);
	}

	async run(): Promise<void> {
		const pick = vscode.window.createQuickPick();
		const sessionDisposables: vscode.Disposable[] = [pick];
		pick.placeholder = 'Search wiki pages\u2026';
		pick.matchOnDescription = true;

		const updateItems = (query: string): void => {
			if (!query) {
				pick.items = this._index.getAllPages().slice(0, 20).map(p => ({
					label: `$(file) ${p.title}`,
					description: p.tags.join(', '),
					detail: truncate(p.description, MAX_DESCRIPTION_LENGTH),
					page: p,
				}));
				return;
			}
			const results = this._bm25.search(query);
			pick.items = results.map(({ page }) => ({
				label: `$(file) ${page.title}`,
				description: page.tags.join(', '),
				detail: truncate(page.description, MAX_DESCRIPTION_LENGTH),
				page,
			}));
		};

		updateItems('');

		sessionDisposables.push(
			pick.onDidChangeValue(updateItems),
			pick.onDidAccept(() => {
				const selected = pick.selectedItems[0] as (vscode.QuickPickItem & { page: unknown });
				disposeAll(sessionDisposables);
				if (selected && isPageItem(selected)) {
					void vscode.window.showTextDocument(selected.page.uri);
				}
			}),
			pick.onDidHide(() => disposeAll(sessionDisposables)),
		);

		pick.show();
	}

	dispose(): void {
		disposeAll(this._disposables);
	}
}

function truncate(text: string, max: number): string {
	return text.length <= max ? text : text.slice(0, max) + '\u2026';
}

function isPageItem(item: vscode.QuickPickItem & { page: unknown }): item is vscode.QuickPickItem & { page: { uri: vscode.Uri } } {
	return typeof item.page === 'object' && item.page !== null && 'uri' in item.page;
}

function disposeAll(disposables: readonly vscode.Disposable[]): void {
	for (const disposable of disposables) {
		disposable.dispose();
	}
}
