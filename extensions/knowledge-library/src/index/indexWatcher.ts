/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WikiIndex } from './wikiIndex';

const decoder = new TextDecoder();

/**
 * Keeps a {@link WikiIndex} in sync with the wiki directory on disk.
 *
 * Wraps a {@link vscode.FileSystemWatcher} scoped to markdown files under the wiki directory and
 * handles create / change / delete events.  Call {@link initialize} once after
 * construction to scan existing files before watcher events take over.
 */
export class IndexWatcher implements vscode.Disposable {
	private readonly _onDidChange = new vscode.EventEmitter<void>();
	private readonly _disposables: vscode.Disposable[] = [this._onDidChange];

	readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

	constructor(private readonly _index: WikiIndex) {
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(_index.wikiDir, '**/*.md'),
		);
		this._disposables.push(
			watcher,
			watcher.onDidCreate(uri => { void this._handleChange(uri); }),
			watcher.onDidChange(uri => { void this._handleChange(uri); }),
			watcher.onDidDelete(uri => this._handleDelete(uri)),
		);
	}

	/**
	 * Scans the wiki directory and populates the index from all existing files.
	 * Must be called once after construction before watcher events take over.
	 */
	async initialize(): Promise<void> {
		const files = await vscode.workspace.findFiles(
			new vscode.RelativePattern(this._index.wikiDir, '**/*.md'),
		);
		await Promise.all(files.map(uri => this._handleChange(uri)));
	}

	private async _handleChange(uri: vscode.Uri): Promise<void> {
		try {
			const contents = await vscode.workspace.fs.readFile(uri);
			this._index.addOrUpdatePage(uri, decoder.decode(contents), Date.now());
			this._onDidChange.fire();
		} catch {
			// File may have been deleted before we could read it; ignore.
		}
	}

	private _handleDelete(uri: vscode.Uri): void {
		this._index.deletePage(uri);
		this._onDidChange.fire();
	}

	dispose(): void {
		for (const d of this._disposables) {
			d.dispose();
		}
	}
}
