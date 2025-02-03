import React, { createContext, useContext } from 'react';
import { WebsocketState, useWebsocketState } from '../stores/websocketStore';

const WebSocketContext = createContext<WebsocketState | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
    const store = useWebsocketState();
    return (
        <WebSocketContext.Provider value={store}>
            {children}
        </WebSocketContext.Provider>
    );
}

export function useWebSocket() {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error('useWebSocket must be used within a WebSocketProvider');
    }
    return context;
}