/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IndexWatcher } from '../index/indexWatcher';
import { WikiIndex, WikiPage, computePageName } from '../index/wikiIndex';

const LINK_INTEGRITY_LABEL = 'Link Integrity';

export class WikiTestController implements vscode.Disposable {
	private readonly _controller = vscode.tests.createTestController('knowledge-library.wikiHealth', 'Knowledge Library');
	private readonly _disposables: vscode.Disposable[] = [this._controller];
	private readonly _pageItems = new Map<string, string>();
	private readonly _linkIntegrityItems = new Map<string, string>();

	constructor(
		private readonly _index: WikiIndex,
		watcher: IndexWatcher,
	) {
		this._controller.resolveHandler = async item => {
			if (!item) {
				await this.refresh();
				return;
			}

			const pageName = this._pageItems.get(item.id);
			if (pageName) {
				this._populatePageTests(item, pageName);
			}
		};

		this._controller.createRunProfile(
			'Run Wiki Health',
			vscode.TestRunProfileKind.Run,
			(request, token) => {
				void this._run(request, token);
			},
			true,
		);

		this._disposables.push(
			watcher.onDidChange(() => {
				void this.refresh();
			}),
		);

		void this.refresh();
	}

	get controller(): vscode.TestController {
		return this._controller;
	}

	async refresh(): Promise<void> {
		this._pageItems.clear();
		this._linkIntegrityItems.clear();
		this._controller.items.replace(this._index.getAllPages().map(page => this._createPageItem(page)));
	}

	getBrokenLinkMessages(pageName: string): string[] {
		const page = this._index.getPage(pageName);
		if (!page) {
			return [];
		}

		return page.links
			.filter(link => !this._index.pageExists(link))
			.map(link => `Wiki page '${link}' not found`);
	}

	dispose(): void {
		for (const disposable of this._disposables) {
			disposable.dispose();
		}
	}

	private _createPageItem(page: WikiPage): vscode.TestItem {
		const pageName = computePageName(page.uri, this._index.wikiDir);
		const item = this._controller.createTestItem(page.uri.toString(true), page.title, page.uri);
		item.canResolveChildren = true;
		this._pageItems.set(item.id, pageName);
		this._populatePageTests(item, pageName);
		return item;
	}

	private _populatePageTests(item: vscode.TestItem, pageName: string): void {
		const page = this._index.getPage(pageName);
		if (!page) {
			item.children.replace([]);
			return;
		}

		const linkIntegrityItem = this._controller.createTestItem(`${item.id}:link-integrity`, LINK_INTEGRITY_LABEL, page.uri);
		this._linkIntegrityItems.set(linkIntegrityItem.id, pageName);
		item.children.replace([linkIntegrityItem]);
	}

	private async _run(request: vscode.TestRunRequest, token: vscode.CancellationToken): Promise<void> {
		const run = this._controller.createTestRun(request);
		try {
			const queue = this._collectRunnableItems(request.include ?? collectTestItems(this._controller.items));
			for (const item of queue) {
				if (token.isCancellationRequested) {
					run.skipped(item);
					continue;
				}

				run.started(item);
				const pageName = this._linkIntegrityItems.get(item.id);
				if (!pageName) {
					run.skipped(item);
					continue;
				}

				const messages = this.getBrokenLinkMessages(pageName);
				if (messages.length === 0) {
					run.passed(item);
				} else {
					run.failed(item, messages.map(message => new vscode.TestMessage(message)));
				}
			}
		} finally {
			run.end();
		}
	}

	private _collectRunnableItems(items: Iterable<vscode.TestItem>): vscode.TestItem[] {
		const queue: vscode.TestItem[] = [];
		for (const item of items) {
			if (this._linkIntegrityItems.has(item.id)) {
				queue.push(item);
				continue;
			}

			const pageName = this._pageItems.get(item.id);
			if (!pageName) {
				continue;
			}

			this._populatePageTests(item, pageName);
			for (const child of collectTestItems(item.children)) {
				queue.push(child);
			}
		}
		return queue;
	}
}

function collectTestItems(collection: vscode.TestItemCollection): vscode.TestItem[] {
	const items: vscode.TestItem[] = [];
	collection.forEach(item => items.push(item));
	return items;
}
