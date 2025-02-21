import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ReactFlowProvider } from '@xyflow/react'

import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";

import { WebSocketProvider } from './components/WebsocketContext';
import { useNodeState } from './stores/nodeStore';
import { shallow } from 'zustand/shallow';
import { getThemeOptions } from './theme/themeConfig';
import { ThemeInjector } from './theme/ThemeInjector';

import App from './App.tsx'
import Box from '@mui/material/Box';
import ToolBar from './components/ToolBar.tsx';
import ActionBar from './components/ActionBar.tsx';

function ThemedApp() {
  const { mode } = useNodeState(state => ({ mode: state.mode }), shallow);
  const theme = createTheme(getThemeOptions(mode));

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ThemeInjector />
      <ReactFlowProvider>
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          width: '100vw',
          overflow: 'hidden',
        }}>
          <ActionBar />
          <Box sx={{
            display: 'flex',
            flex: 1,
            minHeight: 0,
            height: '100%',
          }}>
            <ToolBar />
            <Box sx={{ flex: 1, height: '100%' }}>
              <WebSocketProvider>
                <App />          
              </WebSocketProvider>
            </Box>
          </Box>
        </Box>
      </ReactFlowProvider>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemedApp />
  </StrictMode>
)
