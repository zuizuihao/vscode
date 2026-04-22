/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { activateKnowledgeLibrary, closeAllEditors, deleteWorkspaceFile, waitUntil, workspaceFile, writeWorkspaceFile } from './testUtils';

suite('Knowledge Library Test Controller', () => {
	const createdFiles: vscode.Uri[] = [];

	teardown(async () => {
		await closeAllEditors();
		for (const file of createdFiles.splice(0)) {
			await deleteWorkspaceFile(file);
		}
	});

	test('discovers wiki pages and exposes link integrity checks', async () => {
		const api = await activateKnowledgeLibrary();
		const page = workspaceFile('wiki', 'controller-page.md');
		createdFiles.push(page);

		await writeWorkspaceFile(page, '# Controller Page\n\nBroken [[Missing Controller Page]].');
		await waitUntil(() => api.index.pageExists('controller-page'));
		await waitUntil(() => api.testController.controller.items.get(page.toString(true)) !== undefined);

		const pageItem = api.testController.controller.items.get(page.toString(true));
		assert.ok(pageItem, 'expected page item to be discovered');
		assert.strictEqual(pageItem?.label, 'Controller Page');

		await api.testController.controller.resolveHandler?.(pageItem);
		assert.strictEqual(pageItem?.children.size, 1);
		const children: vscode.TestItem[] = [];
		pageItem!.children.forEach(item => children.push(item));
		const child = children[0];
		assert.strictEqual(child.label, 'Link Integrity');

		const messages = api.testController.getBrokenLinkMessages('controller-page');
		assert.deepStrictEqual(messages, ['Wiki page \'missing controller page\' not found']);
	});
});
