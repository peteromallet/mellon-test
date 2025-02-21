import {
    Edge,
    Node,
    OnConnect,
    NodeChange,
    EdgeChange,
    OnNodesChange,
    OnEdgesChange,
    applyNodeChanges,
    applyEdgeChanges,
    Connection,
    getOutgoers,
    getIncomers,
} from '@xyflow/react';
import { createWithEqualityFn } from 'zustand/traditional';
import { nanoid } from 'nanoid';
import { useWebsocketState } from './websocketStore';

import config from '../../config';

export type WorkflowType = 'workflow' | 'tool';

export type GroupParams = {
    key: string;
    display: 'group' | 'collapse';
    label?: string | null;
    hidden?: boolean;
    disabled?: boolean;
    open?: boolean;
    direction?: 'row' | 'column';
}

export type NodeParams = {
    type?: string | string[];
    label?: string;
    display?: string;
    value?: any;
    spawn?: boolean;
    options?: any;
    default?: any;
    description?: string;
    source?: string;
    min?: number;
    max?: number;
    step?: number;
    group?: GroupParams;
    style?: { [key: string]: string };
    no_validation?: boolean;
    disabled?: boolean;
    hidden?: boolean;
    onChange?: any;
    icon?: string;
};

type NodeData = {
    module: string;
    action: string;
    category: string;
    execution_type: 'workflow' | 'button' | 'continuous';
    params: { [key: string]: NodeParams };
    cache?: boolean;
    time?: number;
    memory?: number;
    label?: string;
    description?: string;
    resizable?: boolean;
    groups?: { [key: string]: { disabled?: boolean, hidden?: boolean, open?: boolean } };
    style?: { [key: string]: string };
    type?: WorkflowType | WorkflowType[]; // Support both single type and array of types
};

type StoredWorkflow = {
    type?: WorkflowType;
    nodes: CustomNodeType[];
    edges: Edge[];
    viewport?: { x: number; y: number; zoom: number };
};

export type CustomNodeType = Node<NodeData, 'custom'>;

// Data format for API export
type APINodeData = {
    // TODO: we also need a workflow id probably
    module: string;
    action: string;
    params: {
        [key: string]: {
            sourceId?: string,
            sourceKey?: string,
            value?: any,
            display?: string,
            type?: string | string[]
        }
    };
};

type GraphExport = {
    sid: string;
    type: WorkflowType;
    nodes: { [key: string]: APINodeData };
    paths: string[][];
};

const formatAPIData = (node: CustomNodeType, edge: Edge[]): APINodeData => {
    const inputEdges = edge.filter(e => e.target === node.id);
    const params: APINodeData['params'] = {};

    Object.entries(node.data.params).forEach(([key, param]) => {
        // We don't need to export output parameters
        if (param.display === 'output') {
            return;
        }

        const edge = inputEdges.find(e => e.targetHandle === key);

        params[key] = {
            sourceId: edge?.source ?? undefined,
            sourceKey: (edge ? edge.sourceHandle : param.source) ?? undefined,
            value: param.value ?? undefined,
            display: param.display ?? undefined,
            type: param.type ?? undefined
        };
    });

    return {
        module: node.data.module,
        action: node.data.action,
        params
    };
};

/*
const findOutputNode = (nodes: CustomNodeType[], edges: Edge[]): CustomNodeType[] => {
    const outputNodes = new Set(edges.map(edge => edge.source));
    return nodes.filter(node => !outputNodes.has(node.id));
};
*/

const buildPath = (
    currentNode: string,
    nodes: CustomNodeType[],
    edges: Edge[],
    visited: Set<string> = new Set()
): string[] => {
    if (visited.has(currentNode)) return []; // Prevent cycles
    visited.add(currentNode);

    // Get all incoming edges to this node
    //const incomingEdges = edges.filter(edge => edge.target === currentNode);
    const node = nodes.find(n => n.id === currentNode);
    if (!node) return [];
    
    const incomingNodes = getIncomers(node, nodes, edges);

    // If this is an input node (no incoming edges), return just this node
    if (incomingNodes.length === 0) {
        return [currentNode];
    }

    const inputPaths = incomingNodes.flatMap(sourceNode =>
        buildPath(sourceNode.id, nodes, edges, new Set(visited))
    );

    return [...inputPaths, currentNode];
};

export function getLocalStorageKey(mode: WorkflowType): string {
    return mode === 'workflow' ? 'workflow' : 'tool';
}

const LAST_MODE_KEY = 'last-mode';

export type NodeState = {
    nodes: CustomNodeType[];
    edges: Edge[];
    mode: WorkflowType;
    viewport: { x: number; y: number; zoom: number } | undefined;
    onNodesChange: OnNodesChange<CustomNodeType>;
    onEdgesChange: OnEdgesChange;
    onEdgeDoubleClick: (id: string) => void;
    onConnect: OnConnect;
    addNode: (node: CustomNodeType) => void;
    setParamValue: (id: string, key: string, value: any) => void;
    setParam: (id: string, param: string, value: any, key?: keyof NodeParams) => void;
    getParam: (id: string, param: string, key: keyof NodeParams) => any;
    setNodeExecuted: (id: string, cache: boolean, time: number, memory: number) => void;
    exportGraph: (sid: string) => GraphExport;
    updateLocalStorage: () => void;
    loadWorkflowFromStorage: (mode?: WorkflowType) => void;
    runSubGraph: (sid: string, nodeId: string) => Promise<void>;
    setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
};

export const useNodeState = createWithEqualityFn<NodeState>((set, get) => ({
    nodes: [],
    edges: [],
    viewport: undefined,
    mode: (() => {
        const lastMode = localStorage.getItem(LAST_MODE_KEY);
        return (lastMode === 'workflow' || lastMode === 'tool') ? lastMode : 'workflow';
    })(),

    setViewport: (viewport: { x: number; y: number; zoom: number }) => {
        set({ viewport });
        get().updateLocalStorage();
    },

    loadWorkflowFromStorage: (overrideMode) => {
        const currentMode = overrideMode ?? get().mode;
        const key = getLocalStorageKey(currentMode);
        const stored = localStorage.getItem(key);

        // Set the mode first, before any other operations
        if (overrideMode) {
            set({ mode: overrideMode });
            localStorage.setItem(LAST_MODE_KEY, overrideMode);
        }

        if (stored) {
            const data: StoredWorkflow = JSON.parse(stored);
            set({
                nodes: data.nodes || [],
                edges: data.edges || [],
                viewport: data.viewport
            });
        } else {
            set({ nodes: [], edges: [], viewport: undefined });
        }
    },

    onNodesChange: async (changes) => {
        const newNodes = applyNodeChanges(changes, get().nodes);
        set({ nodes: newNodes });
        get().updateLocalStorage();

        if (changes.some(change => change.type === 'remove')) {
            const nodeIds = changes.filter(change => change.type === 'remove').map(change => change.id);
            try {
                await fetch('http://' + config.serverAddress + '/clearNodeCache', {
                    method: 'DELETE',
                    body: JSON.stringify({ nodeId: nodeIds }),
                });
            } catch (error) {
                console.error('Can\'t connect to server to clear cache:', error);
            }
        }
    },
    onEdgesChange: (changes: EdgeChange<Edge>[]) => {
        const newEdges = applyEdgeChanges(changes, get().edges);

        // Handle array disconnections
        const removedEdges = changes.filter(change => change.type === 'remove');
        for (const removedEdge of removedEdges) {
            const edge = get().edges.find(e => e.id === removedEdge.id);
            const spawnHandle = get().getParam(edge?.target!, edge?.targetHandle!, 'spawn');
            if (edge && spawnHandle) {
                const targetNode = get().nodes.find(n => n.id === edge.target);
                if (targetNode) {
                    // Remove the specific parameter that was disconnected
                    set({
                        nodes: get().nodes.map(node => {
                            if (node.id === edge.target) {
                                const { [edge.targetHandle!]: _, ...remainingParams } = node.data.params;
                                return {
                                    ...node,
                                    data: {
                                        ...node.data,
                                        params: remainingParams
                                    }
                                };
                            }
                            return node;
                        })
                    });
                }
            }
        }

        set({ edges: newEdges });
        get().updateLocalStorage();
    },
    onEdgeDoubleClick: (id: string) => {
        const edgeChange: EdgeChange = {
            id,
            type: 'remove'
        };
        
        // Use the existing onEdgesChange handler to process the removal
        get().onEdgesChange([edgeChange]);
    },
    onConnect: (conn: Connection) => {
        const updatedEdges = get().edges.filter(
            edge => !(edge.target === conn.target && edge.targetHandle === conn.targetHandle)
        );

        // find the color of the target handle
        const targetHandleEl = document.getElementById(conn.target)?.querySelector(`[data-key="${conn.targetHandle}"] .react-flow__handle`);
        const backgroundColor = targetHandleEl ? window.getComputedStyle(targetHandleEl).backgroundColor : '#aaaaaa';
        const newEdge = { ...conn, id: nanoid(), style: { stroke: backgroundColor } };
        const newEdges = [...updatedEdges, newEdge];
        const spawnHandle = get().getParam(conn.target, conn.targetHandle!, 'spawn');

        // Check if this connection is replacing an existing one
        const isReconnection = get().edges.some(
            edge => edge.target === conn.target && edge.targetHandle === conn.targetHandle
        );

        // Handle array connections
        if (spawnHandle && !isReconnection) {
            const targetNode = get().nodes.find(n => n.id === conn.target);
            if (targetNode) {
                const baseParamKey = conn.targetHandle!.replace(/(\[\d*\])?$/, '');
                const arrayParams = Object.keys(targetNode.data.params)
                    .filter(k => k.startsWith(baseParamKey));

                // we can spawn maximum 32 array parameters
                if (arrayParams.length > 32) {
                    return;
                }

                // find the biggest index of the array params
                const nextIndex = Math.max(...arrayParams.map(k => {
                    const match = k.match(/\[\d*\]$/);
                    return match ? parseInt(match[0].replace('[', '').replace(']', '') || '0') : 0;
                }));
                const newParamKey = `${baseParamKey}[${nextIndex + 1}]`;

                // Clone the base parameter
                const baseParam = targetNode.data.params[conn.targetHandle!];

                // Reorder parameters to keep array fields together
                const orderedParams: { [key: string]: NodeParams } = {};
                Object.entries(targetNode.data.params).forEach(([key, value]) => {
                    orderedParams[key] = value;
                    // Insert the new parameter right after finding an array parameter of the same type
                    if (key === conn.targetHandle) {
                        orderedParams[newParamKey] = { ...baseParam };
                    }
                });

                set({
                    nodes: get().nodes.map(node => {
                        if (node.id === conn.target) {
                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    params: orderedParams
                                }
                            };
                        }
                        return node;
                    })
                });
            }
        }

        set({ edges: newEdges });
        get().updateLocalStorage();
    },
    addNode: (node: CustomNodeType) => {
        //const newNode = { ...node, dragHandle: 'header' };

        // Set initial value for all parameters, TODO: needed? default value should be exported by the server
        if (node.data?.params) {
            Object.keys(node.data.params).forEach(key => {
                const param = node.data.params[key];
                node.data.params[key] = {
                    ...param,
                    value: param.value ?? param.default
                };
            });
        }
        const newNodes = [...get().nodes, node];
        set({ nodes: newNodes });
        get().updateLocalStorage();
    },
    setParamValue: (id: string, key: string, value: any) => {
        // Check if there's an actual change
        const existingNode = get().nodes.find(n => n.id === id);
        if (!existingNode) return;
        const oldVal = existingNode.data.params[key]?.value;
        if (oldVal === value) {
            // If nothing changed, we skip the update and skip triggering sub-graph
            console.log('nodeStore: Skipping update - no change detected', { id, key, value, oldVal });
            return;
        }

        console.log('nodeStore: Updating param value', { id, key, oldValue: oldVal, newValue: value });

        set({
            nodes: get().nodes.map((node) => (
                node.id === id
                ? {
                    ...node,
                    data: {
                        ...node.data,
                        params: {
                            ...node.data.params,
                            [key]: {
                                ...node.data.params[key],
                                value: value
                            }
                        }
                    }
                }
                : node
            ))
        });
        
        get().updateLocalStorage();

        // Verify the update was applied
        const updatedNode = get().nodes.find(n => n.id === id);
        console.log('nodeStore: After update', { 
            id, 
            key, 
            newStoredValue: updatedNode?.data.params[key]?.value,
            fullParams: updatedNode?.data.params
        });

        // If this node is "continuous", do a partial run
        if (existingNode.data.execution_type === 'continuous') {
            // Get the sid from websocket store
            const { sid } = useWebsocketState.getState();
            if (sid) {
                get().runSubGraph(sid, id);
            }
        }
    },
    updateLocalStorage: () => {
        const { nodes, edges, mode } = get();
        const key = getLocalStorageKey(mode);

        const data: StoredWorkflow = {
            type: mode,
            nodes,
            edges,
            viewport: get().viewport
        };
        console.log('nodeStore: Updating localStorage', { 
            key,
            mode,
            nodeCount: nodes.length,
            edgeCount: edges.length,
            viewport: get().viewport
        });
        localStorage.setItem(key, JSON.stringify(data));
        localStorage.setItem(LAST_MODE_KEY, mode);
    },
    setParam: (id: string, param: string, value: any, key?: keyof NodeParams) => {
        const k = key ?? 'value';

        // Check if there's an actual change
        const existingNode = get().nodes.find(n => n.id === id);
        if (!existingNode) return;
        const oldVal = existingNode.data.params[param]?.[k];
        if (oldVal === value) {
            // If no change, skip
            return;
        }

        if (k !== 'group') {
            set({
                nodes: get().nodes.map((node) => (
                    node.id === id
                    ? {
                        ...node,
                        data: {
                            ...node.data,
                            params: {
                                ...node.data.params,
                                [param]: {
                                    ...node.data.params[param],
                                    [k]: value
                                }
                            }
                        }
                    }
                    : node
                ))
            });
        } else {
            set({
                nodes: get().nodes.map((node) => (
                    node.id === id
                    ? { ...node, data: { ...node.data, groups: { ...node.data.groups, [param]: { ...node.data.groups?.[param], ...value } } } }
                    : node
                ))
            });
        }

        get().updateLocalStorage();

        // If execution_type is continuous, run sub-graph
        if (existingNode.data.execution_type === 'continuous') {
            const { sid } = useWebsocketState.getState();
            if (sid) {
                get().runSubGraph(sid, id);
            }
        }
    },
    getParam: (id: string, param: string, key: keyof NodeParams) => {
        const node = get().nodes.find(n => n.id === id);
        return node?.data.params[param][key];
    },
    setNodeExecuted: (id: string, cache: boolean, time: number, memory: number) => {
        set({ nodes: get().nodes.map(node => (node.id === id ? { ...node, data: { ...node.data, cache, time, memory } } : node)) });
    },
    exportGraph: (sid) => {
        const { nodes, edges, mode } = get();
        const outputNodes = nodes.filter(n => getOutgoers(n, nodes, edges).length === 0);
        const paths = outputNodes.map(n => buildPath(n.id, nodes, edges));
        const lookup: { [id: string]: APINodeData } = {};

        for (const node of nodes) {
            lookup[node.id] = formatAPIData(node, edges);
        }

        return {
            sid,
            type: mode,
            nodes: lookup,
            paths
        };
    },
    runSubGraph: async (sid: string, nodeId: string) => {
        const { nodes, edges } = get();
        
        // Find all output nodes (nodes with no outgoing edges)
        const outputNodes = nodes.filter(n => getOutgoers(n, nodes, edges).length === 0);
        
        // Build paths from each output node back to inputs
        const allPaths: string[][] = [];
        
        outputNodes.forEach(outNode => {
            const path = buildPath(outNode.id, nodes, edges);
            if (path.includes(nodeId)) {
                allPaths.push(path);
            }
        });

        // If no paths to outputs found, create a path just to this node
        if (allPaths.length === 0) {
            const singlePath = buildPath(nodeId, nodes, edges);
            allPaths.push(singlePath);
        }

        // Format nodes just like exportGraph does
        const nodesLookup = nodes.reduce((acc, node) => ({
            ...acc,
            [node.id]: formatAPIData(node, edges)
        }), {});

        // Create and send the sub-graph
        const subGraph = {
            sid,
            type: get().mode,
            nodes: nodesLookup,
            paths: allPaths
        };

        try {
            await fetch('http://' + config.serverAddress + '/graph', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subGraph),
            });
        } catch (error) {
            console.error('Error connecting to API server:', error);
        }
    }
}));
