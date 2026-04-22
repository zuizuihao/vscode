/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as assert from 'assert';
import type { KnowledgeLibraryExtensionApi } from '../extension';

const encoder = (value: string) => Uint8Array.from(value.split('').map(char => char.charCodeAt(0)));

export async function activateKnowledgeLibrary(): Promise<KnowledgeLibraryExtensionApi> {
	const extension = vscode.extensions.getExtension<KnowledgeLibraryExtensionApi>('vscode.knowledge-library');
	assert.ok(extension, 'Knowledge Library extension is not available');
	if (!extension) {
		throw new Error('Knowledge Library extension is not available');
	}
	return await extension.activate() as KnowledgeLibraryExtensionApi;
}

export function workspaceFile(...segments: string[]): vscode.Uri {
	return vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, ...segments);
}

export async function writeWorkspaceFile(uri: vscode.Uri, contents: string): Promise<void> {
	await vscode.workspace.fs.writeFile(uri, encoder(contents));
}

export async function deleteWorkspaceFile(uri: vscode.Uri): Promise<void> {
	try {
		await vscode.workspace.fs.delete(uri);
	} catch {
		// Ignore cleanup races.
	}
}

export async function openDocument(uri: vscode.Uri): Promise<vscode.TextDocument> {
	const document = await vscode.workspace.openTextDocument(uri);
	await vscode.window.showTextDocument(document);
	return document;
}

export async function waitUntil(predicate: () => boolean | Promise<boolean>, timeoutMs = 10000): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (await predicate()) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	throw new Error('Timed out waiting for condition');
}

export async function closeAllEditors(): Promise<void> {
	await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
