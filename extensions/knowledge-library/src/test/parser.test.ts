/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { parseFrontmatter, parseSimpleYaml, extractWikilinks, titleFromBody, descriptionFromBody } from '../index/parser';

// ---------------------------------------------------------------------------
// parseSimpleYaml
// ---------------------------------------------------------------------------
suite('parseSimpleYaml', () => {
	test('parses a plain string value', () => {
		assert.deepStrictEqual(parseSimpleYaml('title: Hello World'), { title: 'Hello World' });
	});

	test('parses a single-quoted string value', () => {
		assert.deepStrictEqual(parseSimpleYaml('title: \'My Page\''), { title: 'My Page' });
	});

	test('parses an inline array', () => {
		assert.deepStrictEqual(
			parseSimpleYaml('tags: [ml, nlp, transformers]'),
			{ tags: ['ml', 'nlp', 'transformers'] },
		);
	});

	test('parses a block sequence', () => {
		const yaml = 'tags:\n- ml\n- nlp\n- transformers';
		assert.deepStrictEqual(parseSimpleYaml(yaml), { tags: ['ml', 'nlp', 'transformers'] });
	});

	test('ignores lines without a colon', () => {
		assert.deepStrictEqual(parseSimpleYaml('not a key value pair'), {});
	});

	test('handles multiple keys', () => {
		const yaml = 'title: Foo\ndescription: Bar baz\ntags: [a, b]';
		assert.deepStrictEqual(parseSimpleYaml(yaml), {
			title: 'Foo',
			description: 'Bar baz',
			tags: ['a', 'b'],
		});
	});

	test('block sequence followed by another key', () => {
		const yaml = 'tags:\n- a\n- b\ntitle: After';
		assert.deepStrictEqual(parseSimpleYaml(yaml), { tags: ['a', 'b'], title: 'After' });
	});

	test('empty block sequence sets nothing', () => {
		// Key with empty value but next line is another key (not a sequence item)
		assert.deepStrictEqual(parseSimpleYaml('key:\ntitle: Next'), { title: 'Next' });
	});
});

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------
suite('parseFrontmatter', () => {
	test('parses frontmatter and returns body', () => {
		const text = '---\ntitle: My Page\ntags: [a, b]\n---\n# Body\n\nContent here.';
		const { frontmatter, body } = parseFrontmatter(text);
		assert.deepStrictEqual(frontmatter, { title: 'My Page', tags: ['a', 'b'] });
		assert.strictEqual(body, '# Body\n\nContent here.');
	});

	test('returns empty frontmatter and full text when no fence', () => {
		const text = '# Just a heading\n\nSome text.';
		const { frontmatter, body } = parseFrontmatter(text);
		assert.deepStrictEqual(frontmatter, {});
		assert.strictEqual(body, text);
	});

	test('does not mistake an HR (---) in the body for frontmatter', () => {
		// No leading ---\\n, so should not parse as frontmatter
		const text = '# Title\n\nContent\n\n---\n\nMore content';
		const { frontmatter, body } = parseFrontmatter(text);
		assert.deepStrictEqual(frontmatter, {});
		assert.strictEqual(body, text);
	});

	test('handles CRLF line endings', () => {
		const text = '---\r\ntitle: CRLF Page\r\n---\r\nBody text';
		const { frontmatter, body } = parseFrontmatter(text);
		assert.strictEqual(frontmatter['title'], 'CRLF Page');
		assert.strictEqual(body, 'Body text');
	});
});

// ---------------------------------------------------------------------------
// extractWikilinks
// ---------------------------------------------------------------------------
suite('extractWikilinks', () => {
	test('extracts a single wikilink', () => {
		assert.deepStrictEqual(extractWikilinks('See [[Machine Learning]].'), ['machine learning']);
	});

	test('extracts multiple wikilinks', () => {
		const links = extractWikilinks('See [[ML]] and [[NLP]] for details.');
		assert.deepStrictEqual(links, ['ml', 'nlp']);
	});

	test('handles alias syntax [[Target|Display]]', () => {
		assert.deepStrictEqual(extractWikilinks('See [[Machine Learning|ML]].'), ['machine learning']);
	});

	test('handles section syntax [[Target#Section]]', () => {
		assert.deepStrictEqual(extractWikilinks('See [[Transformers#Attention]].'), ['transformers']);
	});

	test('deduplicates repeated links', () => {
		const links = extractWikilinks('[[Foo]] then [[Foo]] again.');
		assert.deepStrictEqual(links, ['foo']);
	});

	test('returns empty array when no wikilinks', () => {
		assert.deepStrictEqual(extractWikilinks('No links here.'), []);
	});

	test('normalizes to lowercase', () => {
		assert.deepStrictEqual(extractWikilinks('[[Attention Is All You Need]]'), ['attention is all you need']);
	});

	test('does not match broken brackets', () => {
		assert.deepStrictEqual(extractWikilinks('[Not a wikilink]'), []);
	});
});

// ---------------------------------------------------------------------------
// titleFromBody / descriptionFromBody
// ---------------------------------------------------------------------------
suite('titleFromBody', () => {
	test('extracts title from h1', () => {
		assert.strictEqual(titleFromBody('# My Title\n\nContent'), 'My Title');
	});

	test('ignores h2 and deeper', () => {
		assert.strictEqual(titleFromBody('## Not H1\n\nContent'), '');
	});

	test('returns empty string when no heading', () => {
		assert.strictEqual(titleFromBody('Just text, no heading.'), '');
	});

	test('trims trailing whitespace from title', () => {
		assert.strictEqual(titleFromBody('#  Spaced Title  \n'), 'Spaced Title');
	});
});

suite('descriptionFromBody', () => {
	test('returns first non-heading, non-code paragraph', () => {
		const body = '# Title\n\nThis is the first paragraph.\n\nSecond paragraph.';
		assert.strictEqual(descriptionFromBody(body), 'This is the first paragraph.');
	});

	test('skips headings', () => {
		assert.strictEqual(descriptionFromBody('# Heading\n## Sub\nFirst real text'), 'First real text');
	});

	test('skips fenced code blocks', () => {
		assert.strictEqual(descriptionFromBody('```js\ncode\n```\nAfter code'), 'After code');
	});

	test('skips multiple lines inside fenced code blocks', () => {
		const body = '# Title\n\n```ts\nconst hidden = true;\nconst stillHidden = true;\n```\nVisible text';
		assert.strictEqual(descriptionFromBody(body), 'Visible text');
	});

	test('skips table rows', () => {
		assert.strictEqual(descriptionFromBody('| col1 | col2 |\nActual text'), 'Actual text');
	});

	test('truncates at 200 chars with ellipsis', () => {
		const longLine = 'a'.repeat(250);
		const result = descriptionFromBody(longLine);
		assert.strictEqual(result.length, 201); // 200 chars + '…'
		assert.ok(result.endsWith('\u2026'));
	});

	test('returns empty string when body is all headings', () => {
		assert.strictEqual(descriptionFromBody('# A\n## B\n### C\n'), '');
	});
});
