import { createWithEqualityFn } from 'zustand/traditional';
import config from '../../config';
import { NodeParams } from './nodeStore';

type NodeType = {
    [key: string]: {
        label: string
        module: string
        action: string
        category: string
        execution_type?: 'workflow' | 'button' | 'continuous'
        params?: { [key: string]: NodeParams }
    }
}

export type NodeRegistryState = {
    nodeRegistry: NodeType;
    updateNodeRegistry: () => Promise<void>;
}

export const useNodeRegistryState = createWithEqualityFn<NodeRegistryState>((set) => ({
    nodeRegistry: {},
    updateNodeRegistry: async () => {
        try {
            const response = await fetch('http://' + config.serverAddress + '/nodes')
            const data = await response.json()
            set({ nodeRegistry: data })
        } catch (error) {
            console.error('Can\'t connect to route `/nodes`', error)
        }
    },
}))