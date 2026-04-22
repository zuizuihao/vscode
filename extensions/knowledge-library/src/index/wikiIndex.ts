/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	parseFrontmatter,
	titleFromBody,
	descriptionFromBody,
	toStringArray,
	extractWikilinks,
} from './parser';

export interface WikiPage {
	uri: vscode.Uri;
	/** Page title from frontmatter `title:`, first `# Heading`, or filename stem. */
	title: string;
	/** Short summary from frontmatter `description:` or first non-heading paragraph. */
	description: string;
	tags: string[];
	/** Outbound [[wikilinks]] — normalized page names (lowercase, no .md). */
	links: string[];
	/** Inbound links from other pages — computed, not stored in the file. */
	backlinks: string[];
	frontmatter: Record<string, unknown>;
	lastModified: number;
}

function normalizePageLookupName(name: string): string {
	return name.trim().toLowerCase();
}

/**
 * Computes the normalized page name for a wiki file URI.
 * Result is lowercase, relative to wikiDir, without the `.md` extension.
 */
export function computePageName(uri: vscode.Uri, wikiDir: vscode.Uri): string {
	// skipEncoding=true gives raw path segments for reliable cross-platform comparison.
	const uriStr = uri.toString(true);
	const dirStr = wikiDir.toString(true);
	let name = uriStr.startsWith(dirStr + '/')
		? uriStr.slice(dirStr.length + 1)
		: uriStr;
	if (name.endsWith('.md')) {
		name = name.slice(0, -3);
	}
	return name.toLowerCase();
}

/** Parses a single wiki page from its URI and raw text content. */
export function parseWikiPage(
	uri: vscode.Uri,
	text: string,
	lastModified: number,
): WikiPage {
	const { frontmatter, body } = parseFrontmatter(text);
	const filenameStem = uri.path.split('/').pop()?.replace(/\.md$/, '') ?? '';
	const title =
		typeof frontmatter['title'] === 'string' ? frontmatter['title']
			: (titleFromBody(body) || filenameStem);
	const description =
		typeof frontmatter['description'] === 'string' ? frontmatter['description']
			: descriptionFromBody(body);
	const tags = toStringArray(frontmatter['tags']);
	const links = extractWikilinks(body);
	return { uri, title, description, tags, links, backlinks: [], frontmatter, lastModified };
}

/**
 * In-memory index of all wiki pages.
 *
 * Pages are keyed by their normalized page name: lowercase path relative to
 * `wikiDir`, without the `.md` extension (e.g. `concepts/machine-learning`).
 */
export class WikiIndex {
	private readonly _pages = new Map<string, WikiPage>();
	private readonly _aliases = new Map<string, string>();
	private readonly _ambiguousAliases = new Set<string>();

	constructor(readonly wikiDir: vscode.Uri) { }

	addOrUpdatePage(uri: vscode.Uri, text: string, lastModified: number): void {
		const name = computePageName(uri, this.wikiDir);
		const page = parseWikiPage(uri, text, lastModified);
		this._pages.set(name, page);
		this._rebuildLookups();
	}

	deletePage(uri: vscode.Uri): void {
		const name = computePageName(uri, this.wikiDir);
		this._pages.delete(name);
		this._rebuildLookups();
	}

	getPage(name: string): WikiPage | undefined {
		const canonicalName = this._resolveCanonicalName(name);
		return canonicalName ? this._pages.get(canonicalName) : undefined;
	}

	getAllPages(): readonly WikiPage[] {
		return [...this._pages.values()];
	}

	getBacklinksFor(name: string): readonly WikiPage[] {
		const canonicalName = this._resolveCanonicalName(name);
		if (!canonicalName) {
			return [];
		}
		return this.getAllPages().filter(page => page.links.some(link => this._resolveCanonicalName(link) === canonicalName));
	}

	pageExists(name: string): boolean {
		return this.getPage(name) !== undefined;
	}

	clear(): void {
		this._pages.clear();
		this._aliases.clear();
		this._ambiguousAliases.clear();
	}

	private _rebuildLookups(): void {
		this._aliases.clear();
		this._ambiguousAliases.clear();

		for (const [canonicalName, page] of this._pages) {
			this._registerAlias(canonicalName, canonicalName);
			this._registerAlias(page.title, canonicalName);
		}

		for (const page of this._pages.values()) {
			page.backlinks = [];
		}
		for (const [sourceName, page] of this._pages) {
			for (const link of page.links) {
				const target = this.getPage(link);
				if (target) {
					target.backlinks.push(sourceName);
				}
			}
		}
	}

	private _registerAlias(alias: string, canonicalName: string): void {
		const normalizedAlias = normalizePageLookupName(alias);
		if (!normalizedAlias || this._ambiguousAliases.has(normalizedAlias)) {
			return;
		}

		const existing = this._aliases.get(normalizedAlias);
		if (!existing) {
			this._aliases.set(normalizedAlias, canonicalName);
			return;
		}

		if (existing !== canonicalName) {
			this._aliases.delete(normalizedAlias);
			this._ambiguousAliases.add(normalizedAlias);
		}
	}

	private _resolveCanonicalName(name: string): string | undefined {
		return this._aliases.get(normalizePageLookupName(name));
	}
}
