/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { WikiIndex, computePageName } from '../index/wikiIndex';
import { buildGraphData } from './graphDataProvider';

type WebViewMessage =
	| { type: 'open'; name: string };

/** Singleton WebView panel for the wiki graph. */
export class GraphPanel implements vscode.Disposable {
	private static _instance: GraphPanel | undefined;

	static show(
		context: vscode.ExtensionContext,
		index: WikiIndex,
		focusUri: vscode.Uri | undefined,
	): void {
		if (GraphPanel._instance) {
			GraphPanel._instance._panel.reveal();
			GraphPanel._instance._postData(focusUri);
			return;
		}
		GraphPanel._instance = new GraphPanel(context, index, focusUri);
	}

	private readonly _panel: vscode.WebviewPanel;
	private readonly _disposables: vscode.Disposable[] = [];

	private constructor(
		private readonly _context: vscode.ExtensionContext,
		private readonly _index: WikiIndex,
		focusUri: vscode.Uri | undefined,
	) {
		const nonce = generateNonce();
		this._panel = vscode.window.createWebviewPanel(
			'knowledge-library.graph',
			'Wiki Graph',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				localResourceRoots: [
					vscode.Uri.joinPath(_context.extensionUri, 'media', 'graph'),
				],
				retainContextWhenHidden: true,
			},
		);

		this._panel.webview.html = this._buildHtml(nonce);
		this._postData(focusUri);

		this._disposables.push(
			this._panel.webview.onDidReceiveMessage((msg: WebViewMessage) => {
				if (msg.type === 'open') {
					const page = this._index.getPage(msg.name);
					if (page) {
						void vscode.window.showTextDocument(page.uri);
					}
				}
			}),
			this._panel.onDidDispose(() => {
				GraphPanel._instance = undefined;
				this.dispose();
			}),
		);
	}

	private _postData(focusUri: vscode.Uri | undefined): void {
		const focusName = focusUri
			? computePageName(focusUri, this._index.wikiDir)
			: undefined;
		const data = buildGraphData(this._index, focusName);
		void this._panel.webview.postMessage({ type: 'data', data });
	}

	private _buildHtml(nonce: string): string {
		const mediaUri = this._panel.webview.asWebviewUri(
			vscode.Uri.joinPath(this._context.extensionUri, 'media', 'graph'),
		);
		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
	content="default-src 'none';
	script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
	style-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Wiki Graph</title>
<style nonce="${nonce}">
	body { margin: 0; background: #1e1e1e; overflow: hidden; }
	canvas, svg { width: 100vw; height: 100vh; }
	.node circle { fill: #4ec9b0; stroke: #fff; stroke-width: 1.5px; cursor: pointer; }
	.node text { fill: #d4d4d4; font-size: 11px; pointer-events: none; }
	.link { stroke: #555; stroke-width: 1px; }
	#search { position: absolute; top: 10px; left: 10px; background: #252526;
	color: #d4d4d4; border: 1px solid #3c3c3c; padding: 4px 8px;
	font-size: 13px; outline: none; }
</style>
</head>
<body>
<input id="search" type="text" placeholder="Filter nodes\u2026">
<svg id="graph"></svg>
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script nonce="${nonce}">
/* global d3 */
const vscode = acquireVsCodeApi();
let allNodes = [], allEdges = [];

window.addEventListener('message', event => {
	const msg = event.data;
	if (msg.type === 'data') {
		allNodes = msg.data.nodes;
		allEdges = msg.data.edges;
		render(allNodes, allEdges);
	}
});

document.getElementById('search').addEventListener('input', function() {
	const q = this.value.toLowerCase();
	const filtered = q
		? allNodes.filter(n => n.label.toLowerCase().includes(q))
		: allNodes;
	const filteredIds = new Set(filtered.map(n => n.id));
	const filteredEdges = allEdges.filter(e => filteredIds.has(e.source) && filteredIds.has(e.target));
	render(filtered, filteredEdges);
});

function render(nodes, edges) {
	const svg = d3.select('#graph');
	svg.selectAll('*').remove();
	const w = window.innerWidth, h = window.innerHeight;

	const sim = d3.forceSimulation(nodes)
		.force('link', d3.forceLink(edges).id(d => d.id).distance(80))
		.force('charge', d3.forceManyBody().strength(-120))
		.force('center', d3.forceCenter(w / 2, h / 2));

	const g = svg.append('g');
	svg.call(d3.zoom().on('zoom', e => g.attr('transform', e.transform)));

	const link = g.append('g').selectAll('line')
		.data(edges).join('line').attr('class', 'link');

	const node = g.append('g').selectAll('g')
		.data(nodes).join('g').attr('class', 'node')
		.call(d3.drag()
			.on('start', (e, d) => { if (!e.active) { sim.alphaTarget(0.3).restart(); } d.fx = d.x; d.fy = d.y; })
			.on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
			.on('end', (e, d) => { if (!e.active) { sim.alphaTarget(0); } d.fx = null; d.fy = null; })
		)
		.on('click', (_, d) => vscode.postMessage({ type: 'open', name: d.label.toLowerCase() }));

	node.append('circle').attr('r', 8);
	node.append('title').text(d => d.description || d.label);
	node.append('text').attr('dx', 12).attr('dy', 4).text(d => d.label);

	sim.on('tick', () => {
		link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
			.attr('x2', d => d.target.x).attr('y2', d => d.target.y);
		node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
	});
}
</script>
<script nonce="${nonce}">
	void ${JSON.stringify(mediaUri.toString())};
</script>
</body>
</html>`;
	}

	dispose(): void {
		for (const d of this._disposables) {
			d.dispose();
		}
		if (!this._panel) { return; }
		try { this._panel.dispose(); } catch { /* already disposed */ }
	}
}

function generateNonce(): string {
	return crypto.randomBytes(16).toString('hex');
}
