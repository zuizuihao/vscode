/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WikiIndex } from '../index/wikiIndex';
import { IndexWatcher } from '../index/indexWatcher';

const WIKILINK_ALL_RE = /\[\[([^\]|#\n]+?)(?:[|#][^\]]*)?\]\]/g;
const DEBOUNCE_MS = 500;

const MARKDOWN_SELECTOR: vscode.DocumentSelector = { language: 'markdown' };

/**
 * Provides broken-link warnings for `[[wikilink]]` references in markdown files.
 *
 * Updates on:
 * - active document text changes (debounced)
 * - index changes (re-validates all open markdown docs)
 */
export class DiagnosticsProvider implements vscode.Disposable {
	private readonly _collection: vscode.DiagnosticCollection;
	private readonly _disposables: vscode.Disposable[] = [];
	private _debounceTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly _index: WikiIndex,
		watcher: IndexWatcher,
	) {
		this._collection = vscode.languages.createDiagnosticCollection('knowledge-library');
		this._disposables.push(this._collection);

		this._disposables.push(
			vscode.workspace.onDidChangeTextDocument(e => {
				if (this._matchesSelector(e.document)) {
					this._scheduleValidate(e.document);
				}
			}),
			vscode.workspace.onDidOpenTextDocument(doc => {
				if (this._matchesSelector(doc)) {
					this._validateDocument(doc);
				}
			}),
			vscode.workspace.onDidCloseTextDocument(doc => {
				this._collection.delete(doc.uri);
			}),
			watcher.onDidChange(() => {
				this._validateAllOpen();
			}),
		);

		// Validate already-open docs on construction.
		this._validateAllOpen();
	}

	private _matchesSelector(doc: vscode.TextDocument): boolean {
		return vscode.languages.match(MARKDOWN_SELECTOR, doc) > 0;
	}

	private _scheduleValidate(doc: vscode.TextDocument): void {
		if (this._debounceTimer !== undefined) {
			clearTimeout(this._debounceTimer);
		}
		this._debounceTimer = setTimeout(() => {
			this._debounceTimer = undefined;
			this._validateDocument(doc);
		}, DEBOUNCE_MS);
	}

	private _validateAllOpen(): void {
		for (const doc of vscode.workspace.textDocuments) {
			if (this._matchesSelector(doc)) {
				this._validateDocument(doc);
			}
		}
	}

	private _validateDocument(doc: vscode.TextDocument): void {
		const text = doc.getText();
		const diagnostics: vscode.Diagnostic[] = [];

		WIKILINK_ALL_RE.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = WIKILINK_ALL_RE.exec(text)) !== null) {
			const name = m[1].trim().toLowerCase();
			if (!this._index.pageExists(name)) {
				const offset = m.index + 2; // skip past [[
				const start = doc.positionAt(offset);
				const end = doc.positionAt(offset + m[1].length);
				const diag = new vscode.Diagnostic(
					new vscode.Range(start, end),
					`Wiki page '${m[1]}' not found`,
					vscode.DiagnosticSeverity.Warning,
				);
				diag.source = 'knowledge-library';
				diagnostics.push(diag);
			}
		}

		this._collection.set(doc.uri, diagnostics);
	}

	dispose(): void {
		if (this._debounceTimer !== undefined) {
			clearTimeout(this._debounceTimer);
		}
		for (const d of this._disposables) {
			d.dispose();
		}
	}
}
