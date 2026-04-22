/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pure-TypeScript parsing utilities for wiki page content.
 *
 * This module has **no `vscode` dependency** so that it can be unit-tested
 * without an extension host.
 */

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

export const FRONTMATTER_FENCE_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * Lightweight single-pass YAML frontmatter parser.
 * Handles: plain strings, quoted strings, inline arrays `[a, b]`,
 * and block sequences:
 * ```
 * key:
 *   - item1
 *   - item2
 * ```
 */
export function parseSimpleYaml(content: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const lines = content.split('\n');
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const colonIdx = line.indexOf(':');
		if (colonIdx < 1) { i++; continue; }
		const key = line.slice(0, colonIdx).trim();
		const rawValue = line.slice(colonIdx + 1).trim();

		if (rawValue === '') {
			// Block sequence: subsequent lines beginning with '- '
			const items: string[] = [];
			i++;
			while (i < lines.length) {
				const seqLine = lines[i].trimStart();
				if (!seqLine.startsWith('- ')) { break; }
				items.push(seqLine.slice(2).trim().replace(/^['"]|['"]$/g, ''));
				i++;
			}
			if (items.length > 0) {
				result[key] = items;
			}
			continue; // i already advanced past sequence items
		}

		if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
			// Inline sequence: [a, b, c]
			result[key] = rawValue
				.slice(1, -1)
				.split(',')
				.map(s => s.trim().replace(/^['"]|['"]$/g, ''))
				.filter(Boolean);
		} else {
			result[key] = rawValue.replace(/^['"]|['"]$/g, '');
		}
		i++;
	}
	return result;
}

export function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) { return []; }
	return value.filter((item): item is string => typeof item === 'string');
}

export function parseFrontmatter(text: string): { frontmatter: Record<string, unknown>; body: string } {
	const match = FRONTMATTER_FENCE_RE.exec(text);
	if (!match) {
		return { frontmatter: {}, body: text };
	}
	return {
		frontmatter: parseSimpleYaml(match[1]),
		body: text.slice(match[0].length),
	};
}

// ---------------------------------------------------------------------------
// Body extraction
// ---------------------------------------------------------------------------

export function titleFromBody(body: string): string {
	const m = /^#[ \t]+(.+?)[ \t]*$/m.exec(body);
	return m ? m[1] : '';
}

export function descriptionFromBody(body: string): string {
	let inFence = false;
	for (const line of body.split('\n')) {
		const t = line.trim();
		if (t.startsWith('```')) {
			inFence = !inFence;
			continue;
		}
		if (inFence || !t || t.startsWith('#') || t.startsWith('!') || t.startsWith('|')) {
			continue;
		}
		if (t) {
			return t.length > 200 ? t.slice(0, 200) + '\u2026' : t;
		}
	}
	return '';
}

// ---------------------------------------------------------------------------
// Wikilink extraction
// ---------------------------------------------------------------------------

/** Matches `[[Target]]` and `[[Target|Alias]]` and `[[Target#Section]]`. */
export const WIKILINK_RE = /\[\[([^\]|#\n]+?)(?:[|#][^\]]*)?]]/g;

/**
 * Extracts all outbound wikilink targets from `body` text.
 * Returns a deduplicated array of normalized (lowercase, trimmed) names.
 */
export function extractWikilinks(body: string): string[] {
	const links = new Set<string>();
	WIKILINK_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = WIKILINK_RE.exec(body)) !== null) {
		links.add(m[1].trim().toLowerCase());
	}
	return [...links];
}
