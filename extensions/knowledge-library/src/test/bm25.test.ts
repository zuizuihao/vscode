/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { BM25Index, type BM25Page, type ScoredPage } from '../search/bm25';

// ---------------------------------------------------------------------------
// Minimal stub — satisfies BM25Page (no vscode dependency)
// ---------------------------------------------------------------------------

function makePage(title: string, description = '', tags: string[] = []): BM25Page {
	return { title, description, tags };
}

function setPages(index: BM25Index, pages: BM25Page[]): void {
	index.setPages(pages);
}

// ---------------------------------------------------------------------------
// BM25Index
// ---------------------------------------------------------------------------
suite('BM25Index', () => {
	let index: BM25Index;

	setup(() => {
		index = new BM25Index();
	});

	test('returns empty results when no pages', () => {
		setPages(index, []);
		assert.deepStrictEqual(index.search('anything'), []);
	});

	test('returns empty results for empty query', () => {
		setPages(index, [makePage('Attention Mechanism')]);
		assert.deepStrictEqual(index.search(''), []);
	});

	test('finds a page by title keyword', () => {
		const pages = [
			makePage('Attention Mechanism', 'How attention works in transformers'),
			makePage('Positional Encoding', 'How positions are encoded'),
		];
		setPages(index, pages);
		const results = index.search('attention');
		assert.strictEqual(results.length, 1);
		assert.strictEqual(results[0].page.title, 'Attention Mechanism');
	});

	test('ranks title match above description-only match', () => {
		const pages = [
			makePage('Other Topic', 'This page mentions transformers in the description'),
			makePage('Transformer Architecture', 'The main architecture'),
		];
		setPages(index, pages);
		const results = index.search('transformer');
		assert.strictEqual(results[0].page.title, 'Transformer Architecture');
	});

	test('returns top-K results', () => {
		const pages = Array.from({ length: 30 }, (_, i) =>
			makePage(`Page ${i}`, `content about topic alpha`),
		);
		setPages(index, pages);
		const results = index.search('alpha', 5);
		assert.strictEqual(results.length, 5);
	});

	test('all scores are positive', () => {
		const pages = [
			makePage('Machine Learning', 'supervised and unsupervised learning'),
			makePage('Deep Learning', 'neural networks and backprop'),
		];
		setPages(index, pages);
		const results = index.search('learning');
		assert.ok(results.every((r: ScoredPage) => r.score > 0));
	});

	test('marks dirty and rebuilds on setPages', () => {
		setPages(index, [makePage('First')]);
		assert.strictEqual(index.search('first').length, 1);

		setPages(index, [makePage('Second')]);
		const results = index.search('first');
		assert.strictEqual(results.length, 0);
	});

	test('query term not in any document returns empty', () => {
		setPages(index, [makePage('Cats', 'domestic animals'), makePage('Dogs', 'best friends')]);
		assert.deepStrictEqual(index.search('quantum'), []);
	});

	test('finds a page by tag keyword', () => {
		setPages(index, [
			makePage('Attention', 'mechanisms', ['transformers', 'ml']),
			makePage('Graphs', 'relationships', ['visualization']),
		]);
		const results = index.search('transformers');
		assert.strictEqual(results.length, 1);
		assert.strictEqual(results[0].page.title, 'Attention');
	});
});
