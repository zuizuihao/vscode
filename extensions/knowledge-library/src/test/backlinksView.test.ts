/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { activateKnowledgeLibrary, closeAllEditors, deleteWorkspaceFile, openDocument, waitUntil, workspaceFile, writeWorkspaceFile } from './testUtils';

suite('Knowledge Library Backlinks View', () => {
	const createdFiles: vscode.Uri[] = [];

	teardown(async () => {
		await closeAllEditors();
		for (const file of createdFiles.splice(0)) {
			await deleteWorkspaceFile(file);
		}
	});

	test('updates backlinks for the active wiki page', async () => {
		const api = await activateKnowledgeLibrary();
		const target = workspaceFile('wiki', 'target-page.md');
		const source = workspaceFile('wiki', 'source-page.md');
		createdFiles.push(target, source);

		const waitForBacklinks = async (expectedCount: number): Promise<void> => {
			await waitUntil(() => api.index.getBacklinksFor('target-page').length === expectedCount && api.backlinksProvider.getChildren().length === expectedCount);
		};

		await writeWorkspaceFile(target, '# Target Page\n\nTarget page content.');
		await writeWorkspaceFile(source, '# Source Page\n\nSee [[Target Page]].');

		await waitUntil(() => api.index.pageExists('target-page') && api.index.pageExists('source-page'));
		await openDocument(target);

		// Wait for the active editor change event to propagate to the backlinks provider.
		await waitUntil(() => vscode.window.activeTextEditor?.document.uri.toString(true) === target.toString(true));
		await waitForBacklinks(1);
		let children = api.backlinksProvider.getChildren();
		assert.strictEqual(children.length, 1);
		assert.strictEqual(children[0].label, 'Source Page');

		await writeWorkspaceFile(source, '# Source Page\n\nNo links remain here.');
		await waitForBacklinks(0);
		children = api.backlinksProvider.getChildren();
		assert.strictEqual(children.length, 0);
	});
});
