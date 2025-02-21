import config from '../../config';

export interface NodePersistentData {
    params: { [key: string]: any };
    files?: string[];
    cache?: boolean;
    time?: number;
    memory?: number;
    event?: string;
    eventId?: number;
}

class DataService {
    private baseUrl: string;
    private readonly FILES_BASE_PATH = '';

    constructor() {
        this.baseUrl = `http://${config.serverAddress}`;
    }

    getFullFilePath(fileName: string): string {
        const baseFileName = fileName.includes('/') ? fileName.split('/').pop()! : fileName;
        return baseFileName;
    }

    async saveNodeData(nodeName: string, data: NodePersistentData): Promise<void> {
        console.log('📤 DataService.saveNodeData called:', {
            nodeName,
            data: JSON.stringify(data).slice(0, 500) + '...',
            hasEvent: Boolean(data.event),
            event: data.event,
            eventId: data.eventId,
            timestamp: new Date().toISOString()
        });

        if (data.params && !data.event && data.params.event) {
            data.event = data.params.event;
            delete data.params.event;
        }
        if (data.params && !data.eventId && data.params.eventId) {
            data.eventId = data.params.eventId;
            delete data.params.eventId;
        }

        const response = await fetch(`${this.baseUrl}/node/${nodeName}/data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            console.error('❌ Failed to save node data:', {
                nodeName,
                status: response.status,
                statusText: response.statusText,
                timestamp: new Date().toISOString()
            });
            throw new Error(`Failed to save node data: ${response.statusText}`);
        }

        console.log('✅ DataService.saveNodeData success:', {
            nodeName,
            timestamp: new Date().toISOString()
        });
    }

    async loadNodeData(nodeName: string): Promise<NodePersistentData | null> {
        try {
            console.log('📥 DataService.loadNodeData called:', {
                nodeName,
                timestamp: new Date().toISOString()
            });

            const response = await fetch(`${this.baseUrl}/node/${nodeName}/data`);
            if (response.ok) {
                const data = await response.json();
                console.log('✅ DataService.loadNodeData success:', {
                    nodeName,
                    hasEvent: Boolean(data.event),
                    event: data.event,
                    eventId: data.eventId,
                    data: JSON.stringify(data).slice(0, 500) + '...',
                    timestamp: new Date().toISOString()
                });
                return data;
            }
            if (response.status === 404) {
                console.log('⚠️ DataService.loadNodeData - No data found:', {
                    nodeName,
                    timestamp: new Date().toISOString()
                });
                return null;
            }
            throw new Error(`Failed to load node data: ${response.statusText}`);
        } catch (error: any) {
            console.error('❌ DataService.loadNodeData error:', {
                nodeName,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            return null;
        }
    }

    async deleteNodeData(nodeName: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/node/${nodeName}/data`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`Failed to delete node data: ${response.statusText}`);
        }
    }

    async saveNodeFile(nodeName: string, fileName: string, fileData: ArrayBuffer): Promise<string> {
        const formData = new FormData();
        const baseFileName = fileName.includes('/') ? fileName.split('/').pop()! : fileName;
        formData.append('file', new Blob([fileData]), baseFileName);

        const response = await fetch(`${this.baseUrl}/data/files`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Failed to save node file: ${response.statusText}`);
        }

        return baseFileName;
    }

    async loadNodeFile(nodeName: string, fileName: string): Promise<ArrayBuffer | null> {
        try {
            const baseFileName = fileName.includes('/') ? fileName.split('/').pop()! : fileName;
            const response = await fetch(`${this.baseUrl}/data/files/${baseFileName}`);
            if (response.ok) {
                return await response.arrayBuffer();
            }
            if (response.status === 404) {
                return null;
            }
            throw new Error(`Failed to load node file: ${response.statusText}`);
        } catch (error) {
            console.error(`Error loading file ${fileName} for node ${nodeName}:`, error);
            return null;
        }
    }

    async deleteNodeFile(nodeName: string, fileName: string): Promise<void> {
        const baseFileName = fileName.includes('/') ? fileName.split('/').pop()! : fileName;
        const response = await fetch(`${this.baseUrl}/data/files/${baseFileName}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`Failed to delete node file: ${response.statusText}`);
        }
    }
}

// Create and export a singleton instance
export const dataService = new DataService();
export default dataService; 