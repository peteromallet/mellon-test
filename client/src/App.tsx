import { useEffect } from 'react';
import { 
  ReactFlow,
  Background,
  Controls,
  NodeOrigin,
  Viewport,
  Connection,
  Edge,
  EdgeMouseHandler,
  IsValidConnection
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
  mode: state.mode,
  viewport: state.viewport,
  setViewport: state.setViewport,
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
    mode,
    viewport,
    setViewport,
  } = useNodeState(selectNodeState, shallow);
  const { nodeRegistry, updateNodeRegistry } = useNodeRegistryState(selectNodeRegistryState, shallow);
  const { connect: connectWebsocket } = useWebsocketState(selectWebsocketState, shallow);
  
  useEffect(() => {
    // Load workflow from localStorage and initialize other services
    loadWorkflowFromStorage();
    updateNodeRegistry();
    connectWebsocket('ws://' + config.serverAddress + '/ws');
  }, []);

  // Save viewport position when it changes
  const onMoveEnd = (_: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    setViewport(viewport);
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
      
      // Ensure we preserve the viewport from the loaded file
      const storedData = JSON.parse(localStorage.getItem(key) || '{}');
      const newData = {
        ...flow,
        viewport: flow.viewport || storedData.viewport
      };
      localStorage.setItem(key, JSON.stringify(newData));
      
      // Now load it through the store which will handle setting the mode
      loadWorkflowFromStorage(flow.type);
    };
    reader.readAsText(file);
  };

  // Handle drag and drop
  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    // Handle workflow JSON file drop
    if (event.dataTransfer.files.length > 0) {
      onWorkflowDrop(event);
      return;
    }

    // Handle node drop
    const nodeKey = event.dataTransfer.getData('text/plain');
    if (!nodeKey || !nodeRegistry[nodeKey]) return;

    const node = nodeRegistry[nodeKey];

    // Get the position of the drop
    const reactFlowBounds = event.currentTarget.getBoundingClientRect();
    const position = {
      x: event.clientX - reactFlowBounds.left,
      y: event.clientY - reactFlowBounds.top,
    };

    addNode({
      id: nodeKey + '-' + Math.random().toString(36).substr(2, 9),
      type: 'custom',
      position,
      data: {
        ...node,
        execution_type: node.execution_type ?? 'workflow',  // Ensure execution_type is always defined
        params: node.params ?? {},  // Ensure params is always defined
      },
    });
  };

  const isValidConnection = (connection: Connection) => {
    return true;
  };

  const handleEdgeDoubleClick: EdgeMouseHandler = (event, edge) => {
    onEdgeDoubleClick(edge.id);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onEdgeDoubleClick={handleEdgeDoubleClick}
      onConnect={onConnect}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onMoveEnd={onMoveEnd}
      isValidConnection={isValidConnection as IsValidConnection}
      nodeTypes={nodeTypes}
      nodeOrigin={nodeOrigin}
      viewport={viewport}
      fitView={!viewport}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
