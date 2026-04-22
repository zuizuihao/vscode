/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WikiIndex, WikiPage, computePageName } from '../index/wikiIndex';
import { IndexWatcher } from '../index/indexWatcher';

class BacklinkItem extends vscode.TreeItem {
	constructor(
		readonly page: WikiPage,
		/** 1-based line number of the [[wikilink]] in this page (0 if unknown). */
		readonly linkLine: number,
	) {
		super(page.title, vscode.TreeItemCollapsibleState.None);
		this.description = page.uri.path.split('/').slice(-2).join('/');
		this.tooltip = page.description;
		this.command = {
			command: 'vscode.open',
			title: 'Open File',
			arguments: [
				page.uri,
				linkLine > 0
					? { selection: new vscode.Range(linkLine - 1, 0, linkLine - 1, 0) }
					: undefined,
			],
		};
		this.iconPath = new vscode.ThemeIcon('file');
	}
}

export class BacklinksProvider implements vscode.TreeDataProvider<BacklinkItem>, vscode.Disposable {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

	private readonly _disposables: vscode.Disposable[] = [this._onDidChangeTreeData];
	private _currentPageName: string | undefined;

	constructor(
		private readonly _index: WikiIndex,
		watcher: IndexWatcher,
	) {
		this._disposables.push(
			vscode.window.onDidChangeActiveTextEditor(editor => {
				this._updateCurrentPage(editor?.document);
			}),
			watcher.onDidChange(() => {
				this._onDidChangeTreeData.fire();
			}),
		);
		this._updateCurrentPage(vscode.window.activeTextEditor?.document);
	}

	private _updateCurrentPage(doc: vscode.TextDocument | undefined): void {
		if (doc?.languageId === 'markdown') {
			this._currentPageName = computePageName(doc.uri, this._index.wikiDir);
		} else {
			this._currentPageName = undefined;
		}
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(item: BacklinkItem): vscode.TreeItem {
		return item;
	}

	getChildren(): BacklinkItem[] {
		if (!this._currentPageName) {
			return [];
		}
		return this._index.getBacklinksFor(this._currentPageName).map(page => new BacklinkItem(page, 0));
	}

	dispose(): void {
		for (const d of this._disposables) {
			d.dispose();
		}
	}
}


