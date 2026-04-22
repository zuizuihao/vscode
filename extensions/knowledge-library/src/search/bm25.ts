/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const K1 = 1.5;
const B = 0.75;
const TITLE_BOOST = 3;

/** Minimal page shape that BM25 needs. `WikiPage` satisfies this via structural typing. */
export interface BM25Page {
	title: string;
	description: string;
	tags: string[];
}

export interface ScoredPage {
	page: BM25Page;
	score: number;
}

function tokenize(text: string): string[] {
	return text.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1);
}

interface InvertedIndex {
	tf: Map<string, Map<number, number>>;   // term -> docId -> raw frequency
	df: Map<string, number>;                // term -> document frequency
	lengths: number[];                      // docId -> token count
	avgLength: number;
}

/** Lightweight BM25 index over wiki pages. No external dependencies. */
export class BM25Index {
	private _dirty = true;
	private _pages: readonly BM25Page[] = [];
	private _index: InvertedIndex = { tf: new Map(), df: new Map(), lengths: [], avgLength: 0 };

	markDirty(): void {
		this._dirty = true;
	}

	setPages(pages: readonly BM25Page[]): void {
		this._pages = pages;
		this._dirty = true;
	}

	search(query: string, topK = 20): ScoredPage[] {
		if (this._dirty) {
			this._rebuild();
		}
		if (this._pages.length === 0) {
			return [];
		}

		const queryTerms = tokenize(query);
		if (queryTerms.length === 0) {
			return [];
		}

		const N = this._pages.length;
		const scores = new Float64Array(N);

		for (const term of queryTerms) {
			const df = this._index.df.get(term) ?? 0;
			if (df === 0) {
				continue;
			}
			const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
			const tfMap = this._index.tf.get(term)!;
			for (const [docId, tf] of tfMap) {
				const docLen = this._index.lengths[docId];
				const norm = K1 * (1 - B + B * docLen / this._index.avgLength);
				scores[docId] += idf * (tf * (K1 + 1)) / (tf + norm);
			}
		}

		const results: ScoredPage[] = [];
		for (let i = 0; i < N; i++) {
			if (scores[i] > 0) {
				results.push({ page: this._pages[i], score: scores[i] });
			}
		}
		return results.sort((a, b) => b.score - a.score).slice(0, topK);
	}

	private _rebuild(): void {
		const tf = new Map<string, Map<number, number>>();
		const df = new Map<string, number>();
		const lengths: number[] = [];
		let totalLength = 0;

		for (let docId = 0; docId < this._pages.length; docId++) {
			const page = this._pages[docId];
			// Boost title tokens by repeating them
			const titleTokens = tokenize(page.title);
			const boostedTitle = Array.from<string>({ length: TITLE_BOOST }).flatMap(() => titleTokens);
			const bodyTokens = tokenize(`${page.description} ${page.tags.join(' ')}`);
			const tokens = [...boostedTitle, ...bodyTokens];
			lengths.push(tokens.length);
			totalLength += tokens.length;

			const termFreq = new Map<string, number>();
			for (const token of tokens) {
				termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
			}

			for (const [term, freq] of termFreq) {
				let docMap = tf.get(term);
				if (!docMap) {
					docMap = new Map();
					tf.set(term, docMap);
				}
				docMap.set(docId, freq);
				df.set(term, (df.get(term) ?? 0) + 1);
			}
		}

		this._index = {
			tf,
			df,
			lengths,
			avgLength: this._pages.length > 0 ? totalLength / this._pages.length : 0,
		};
		this._dirty = false;
	}
}
