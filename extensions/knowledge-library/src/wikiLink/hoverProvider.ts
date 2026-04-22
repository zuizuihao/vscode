/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WikiIndex } from '../index/wikiIndex';
import { wikilinkAtPosition } from './definitionProvider';

const MAX_HOVER_LINES = 3;

export class WikiLinkHoverProvider implements vscode.HoverProvider {
	constructor(private readonly _index: WikiIndex) { }

	async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
	): Promise<vscode.Hover | undefined> {
		const name = wikilinkAtPosition(document, position);
		if (!name) {
			return undefined;
		}
		const page = this._index.getPage(name);
		if (!page) {
			return undefined;
		}

		let bodyText = '';
		try {
			const doc = await vscode.workspace.openTextDocument(page.uri);
			bodyText = doc.getText();
		} catch {
			return undefined;
		}

		const excerpt = extractExcerpt(bodyText, MAX_HOVER_LINES);
		if (!excerpt) {
			return undefined;
		}

		const md = new vscode.MarkdownString();
		md.appendMarkdown(`**${page.title}**\n\n`);
		md.appendMarkdown(excerpt);
		if (page.tags.length > 0) {
			md.appendMarkdown(`\n\n_Tags: ${page.tags.join(', ')}_`);
		}
		return new vscode.Hover(md);
	}
}

function extractExcerpt(text: string, maxLines: number): string {
	// Skip frontmatter using the same fence regex as the parser.
	const fmMatch = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text);
	const body = fmMatch ? text.slice(fmMatch[0].length) : text;

	const lines: string[] = [];
	for (const line of body.split('\n')) {
		const t = line.trim();
		if (!t || t.startsWith('```') || t.startsWith('|')) {
			continue;
		}
		lines.push(line);
		if (lines.length >= maxLines) {
			break;
		}
	}
	return lines.join('\n');
}
