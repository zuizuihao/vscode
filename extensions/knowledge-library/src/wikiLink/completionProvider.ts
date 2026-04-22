/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WikiIndex } from '../index/wikiIndex';

const WIKILINK_OPEN_RE = /\[\[([^\]|#\n]*)$/;

export class WikiLinkCompletionProvider implements vscode.CompletionItemProvider {
	constructor(private readonly _index: WikiIndex) { }

	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): vscode.CompletionItem[] | undefined {
		const linePrefix = document.lineAt(position).text.slice(0, position.character);
		if (!WIKILINK_OPEN_RE.test(linePrefix)) {
			return undefined;
		}

		return this._index.getAllPages().map(page => {
			const item = new vscode.CompletionItem(page.title, vscode.CompletionItemKind.File);
			item.detail = page.tags.join(', ');
			item.documentation = page.description;
			item.insertText = new vscode.SnippetString(`${page.title}]]`);
			// Replace the partial text already typed after [[
			const match = WIKILINK_OPEN_RE.exec(linePrefix);
			const partialLength = match ? match[1].length : 0;
			if (partialLength > 0) {
				const start = position.translate(0, -partialLength);
				item.range = new vscode.Range(start, position);
			}
			return item;
		});
	}
}
