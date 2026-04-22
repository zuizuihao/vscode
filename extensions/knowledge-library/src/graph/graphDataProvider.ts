/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WikiIndex, computePageName } from '../index/wikiIndex';

export interface GraphNode {
	id: string;
	label: string;
	tags: string[];
	description: string;
}

export interface GraphEdge {
	source: string;
	target: string;
}

export interface GraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

/** Serializes the wiki index to a plain `{ nodes, edges }` object for the WebView. */
export function buildGraphData(index: WikiIndex, focusName?: string): GraphData {
	const allPages = index.getAllPages();

	let includedNames: Set<string>;
	if (focusName) {
		// Local graph: the focus page + its direct neighbours (inbound + outbound)
		const focus = index.getPage(focusName);
		const neighbours = new Set<string>(focus?.links ?? []);
		for (const page of allPages) {
			if (page.links.includes(focusName)) {
				neighbours.add(computePageName(page.uri, index.wikiDir));
			}
		}
		neighbours.add(focusName);
		includedNames = neighbours;
	} else {
		includedNames = new Set(allPages.map(p => computePageName(p.uri, index.wikiDir)));
	}

	const nodes: GraphNode[] = allPages
		.filter(p => includedNames.has(computePageName(p.uri, index.wikiDir)))
		.map(p => ({
			id: p.uri.toString(true),
			label: p.title,
			tags: p.tags,
			description: p.description,
		}));

	const nodeIds = new Set(nodes.map(n => n.id));
	const edges: GraphEdge[] = [];

	for (const page of allPages) {
		const sourceId = page.uri.toString(true);
		if (!nodeIds.has(sourceId)) { continue; }
		for (const link of page.links) {
			const target = index.getPage(link);
			if (target) {
				const targetId = target.uri.toString(true);
				if (nodeIds.has(targetId)) {
					edges.push({ source: sourceId, target: targetId });
				}
			}
		}
	}

	return { nodes, edges };
}
