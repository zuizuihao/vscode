/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { activateKnowledgeLibrary, closeAllEditors, deleteWorkspaceFile, openDocument, waitUntil, workspaceFile, writeWorkspaceFile } from './testUtils';

suite('Knowledge Library Markdown Providers', () => {
	const createdFiles: vscode.Uri[] = [];
	let api: Awaited<ReturnType<typeof activateKnowledgeLibrary>>;

	setup(async () => {
		api = await activateKnowledgeLibrary();
	});

	teardown(async () => {
		await closeAllEditors();
		for (const file of createdFiles.splice(0)) {
			await deleteWorkspaceFile(file);
		}
	});

	test('provides completion, definition, hover, and diagnostics for wikilinks', async () => {
		const target = workspaceFile('wiki', 'machine-learning.md');
		const source = workspaceFile('wiki', 'providers-test.md');
		createdFiles.push(target, source);

		await writeWorkspaceFile(target, [
			'---',
			'tags: [ml, testing]',
			'---',
			'# Machine Learning',
			'',
			'Machine learning summary.',
		].join('\n'));
		await writeWorkspaceFile(source, [
			'See [[Mach',
			'',
			'See [[Machine Learning]].',
			'',
			'Broken [[Missing Page]].',
		].join('\n'));

		// Wait for the index to pick up the newly written files before querying providers.
		await waitUntil(() => api.index.pageExists('machine-learning'));

		const document = await openDocument(source);
		const completionPosition = new vscode.Position(0, document.lineAt(0).text.length);
		const completions = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', source, completionPosition);
		assert.ok(completions);
		const completion = completions.items.find(item => item.label === 'Machine Learning');
		assert.ok(completion, 'expected Machine Learning completion');
		assert.strictEqual(completion?.detail, 'ml, testing');

		const definitionPosition = new vscode.Position(2, 8);
		const definitions = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeDefinitionProvider', source, definitionPosition);
		assert.ok(definitions);
		assert.strictEqual(definitions[0].uri.toString(true), target.toString(true));

		const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', source, definitionPosition);
		assert.ok(hovers);
		assert.ok(hovers[0].contents.some(content => content instanceof vscode.MarkdownString && content.value.includes('Machine learning summary.')));

		await waitUntil(() => vscode.languages.getDiagnostics(source).some(diagnostic => diagnostic.message === 'Wiki page \'Missing Page\' not found'));
		const diagnostics = vscode.languages.getDiagnostics(source);
		assert.strictEqual(diagnostics.length, 1);
		assert.strictEqual(diagnostics[0].source, 'knowledge-library');
	});
});
