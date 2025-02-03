import { useEffect } from 'react';
import { 
  ReactFlow,
  //Controls,
  Background,
  BackgroundVariant,
  NodeOrigin,
  useReactFlow,
  Connection,
  IsValidConnection,
  Viewport
} from '@xyflow/react';
import { shallow } from 'zustand/shallow';
import { useNodeState, NodeState, CustomNodeType, getLocalStorageKey } from './stores/nodeStore';
import { useNodeRegistryState, NodeRegistryState } from './stores/nodeRegistryStore';
import { useWebsocketState, WebsocketState } from './stores/websocketStore';

import { nanoid } from 'nanoid';

import config from '../config';
import CustomNode from './components/CustomNode';

import '@xyflow/react/dist/base.css';
import './app.css';

const nodeTypes = {
  custom: CustomNode,
};

const selectNodeState = (state: NodeState) => ({
  nodes: state.nodes,
  edges: state.edges,
  onNodesChange: state.onNodesChange,
  onEdgesChange: state.onEdgesChange,
  onEdgeDoubleClick: state.onEdgeDoubleClick,
  onConnect: state.onConnect,
  addNode: state.addNode,
  getParam: state.getParam,
  loadWorkflowFromStorage: state.loadWorkflowFromStorage,
});

const selectNodeRegistryState = (state: NodeRegistryState) => ({
  nodeRegistry: state.nodeRegistry,
  updateNodeRegistry: state.updateNodeRegistry,
});

const selectWebsocketState = (state: WebsocketState) => ({
  connect: state.connect,
});

const nodeOrigin: NodeOrigin = [0, 0];

export default function App() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onEdgeDoubleClick,
    onConnect,
    addNode,
    getParam,
    loadWorkflowFromStorage,
  } = useNodeState(selectNodeState, shallow);
  const { nodeRegistry, updateNodeRegistry } = useNodeRegistryState(selectNodeRegistryState, shallow);
  const { connect: connectWebsocket } = useWebsocketState(selectWebsocketState, shallow);
  const { screenToFlowPosition, setViewport } = useReactFlow();

  useEffect(() => {
    // Load workflow from localStorage and initialize other services
    loadWorkflowFromStorage();
    updateNodeRegistry();
    connectWebsocket('ws://' + config.serverAddress + '/ws');
  }, []);

  // Save viewport position when it changes
  const onMoveEnd = (_: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    const { mode } = useNodeState.getState();
    const key = getLocalStorageKey(mode);
    const stored = localStorage.getItem(key) || '{}';
    const data = JSON.parse(stored);
    data.viewport = viewport;
    localStorage.setItem(key, JSON.stringify(data));
  };
  
  // Handle drag & drop of workflow JSON
  const onWorkflowDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file?.type !== 'application/json') return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const flow = JSON.parse(e.target?.result as string);
      // Set default type if not present
      if (!flow.type) {
        flow.type = 'workflow';
      }

      // Store the workflow in the appropriate localStorage key
      const key = getLocalStorageKey(flow.type);
      localStorage.setItem(key, JSON.stringify(flow));
      
      // Now load it through the store which will handle setting the mode
      loadWorkflowFromStorage(flow.type);
    };
    reader.readAsText(file);
  };

  // Normal DnD (adding nodes from sidebar)
  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (event.dataTransfer.types.includes('Files')) {
      event.dataTransfer.dropEffect = 'copy';
      return;
    }
    event.dataTransfer.dropEffect = 'move';
  }

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    // If a user dropped a .json file for the workflow
    if (event.dataTransfer.files.length > 0) {
      onWorkflowDrop(event);
      return;
    }

    if (!nodeRegistry) return;

    const key = event.dataTransfer.getData('text/plain');
    if (!key || !nodeRegistry[key]) return;

    const nodeData = nodeRegistry[key];

    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const newNode = {
      id: nanoid(),
      type: 'custom', // for now we only have custom type
      position,
      data: nodeData,
    };

    addNode(newNode as CustomNodeType);
  }

  const isValidConnection = (connection: Connection) => {
    if (!connection.sourceHandle || !connection.targetHandle) return false;

    // prevent self-loops
    if (connection.source === connection.target) return false;

    let sourceType = getParam(connection.source, connection.sourceHandle, 'type');
    let targetType = getParam(connection.target, connection.targetHandle, 'type');
    sourceType = Array.isArray(sourceType) ? sourceType : [sourceType];
    sourceType.push('any');
    targetType = Array.isArray(targetType) ? targetType : [targetType];

    if (!sourceType.some((type: string) => targetType.includes(type))) return false;

    return true;
  }

  // Get stored viewport or use defaults
  const defaultViewport = (() => {
    const { mode } = useNodeState.getState();
    const key = getLocalStorageKey(mode);
    const stored = localStorage.getItem(key);
    if (stored) {
      const { viewport } = JSON.parse(stored);
      if (viewport) {
        return viewport;
      }
    }
    return { x: 0, y: 0, zoom: 1 };
  })();

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onEdgeDoubleClick={(_, edge) => onEdgeDoubleClick(edge.id)}
      isValidConnection={isValidConnection as IsValidConnection}
      onConnect={onConnect}
      nodeOrigin={nodeOrigin}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMoveEnd={onMoveEnd}
      edgesReconnectable={true}
      defaultViewport={defaultViewport}
      minZoom={0.1}
      maxZoom={1.2}
      //connectionRadius={18}
      //fitView
      proOptions={{hideAttribution: true}}
      deleteKeyCode={['Backspace', 'Delete']}      
    >
      {/* <Controls position="bottom-right" /> */}
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="rgba(255, 255, 255, 0.3)" />
    </ReactFlow>
  );
}
