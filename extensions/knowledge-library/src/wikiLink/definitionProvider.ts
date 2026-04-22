/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WikiIndex } from '../index/wikiIndex';

const WIKILINK_AT_CURSOR_RE = /\[\[([^\]|#\n]+?)(?:[|#][^\]]*)?\]\]/g;

/**
 * Returns the wikilink target name under the cursor, or `undefined` if the cursor
 * is not within a `[[wikilink]]`.
 */
export function wikilinkAtPosition(
	document: vscode.TextDocument,
	position: vscode.Position,
): string | undefined {
	const line = document.lineAt(position).text;
	WIKILINK_AT_CURSOR_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = WIKILINK_AT_CURSOR_RE.exec(line)) !== null) {
		const start = m.index;
		const end = m.index + m[0].length;
		if (position.character >= start && position.character <= end) {
			return m[1].trim().toLowerCase();
		}
	}
	return undefined;
}

export class WikiLinkDefinitionProvider implements vscode.DefinitionProvider {
	constructor(private readonly _index: WikiIndex) { }

	provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
	): vscode.Location | undefined {
		const name = wikilinkAtPosition(document, position);
		if (!name) {
			return undefined;
		}
		const page = this._index.getPage(name);
		if (!page) {
			return undefined;
		}
		return new vscode.Location(page.uri, new vscode.Position(0, 0));
	}
}
