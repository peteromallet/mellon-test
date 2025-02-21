import { useMemo, useState } from 'react'

import Box from '@mui/material/Box'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
//import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import ToggleButton from '@mui/material/ToggleButton'
//import Stack from '@mui/material/Stack'
import { useTheme } from '@mui/material/styles'

import { shallow } from 'zustand/shallow';
import { NodeRegistryState, useNodeRegistryState } from '../stores/nodeRegistryStore';
import { useNodeState, WorkflowType } from '../stores/nodeStore';

import OutlinedInput from '@mui/material/OutlinedInput'
import SearchIcon from '@mui/icons-material/Search'
import Accordion from '@mui/material/Accordion'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import BuildIcon from '@mui/icons-material/Build'
import ColorLensIcon from '@mui/icons-material/ColorLens'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import ExtensionIcon from '@mui/icons-material/Extension'
import SettingsIcon from '@mui/icons-material/Settings'
import ImageIcon from '@mui/icons-material/Image'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import DataObjectIcon from '@mui/icons-material/DataObject'

const sidebarWidth = 260

const selectNodeRegistryState = (state: NodeRegistryState) => ({
  nodeRegistry: state.nodeRegistry,
});

const groupBy = (field: string, nodeRegistry: any, localMode: WorkflowType) => {
  const grouped = Object.entries(nodeRegistry).reduce((acc: any, [key, node]: [string, any]) => {
    // Check if this node should be shown in current mode
    const nodeType = node.type || 'workflow';
    const nodeTypes = Array.isArray(nodeType) ? nodeType : [nodeType];
    if (!nodeTypes.includes(localMode)) {
      return acc;
    }

    const fieldValue = node[field] || 'default';
    if (!acc[fieldValue]) {
      acc[fieldValue] = [];
    }
    acc[fieldValue].push({ key, ...node });
    return acc;
  }, {});

  if (field !== 'module') {
    // Sort nodes within each module alphabetically by label
    Object.keys(grouped).forEach(module => {
      grouped[module].sort((a: any, b: any) => 
        (a.label || a.key).localeCompare(b.label || b.key)
      );
    });
  }

  // Return as sorted object with sorted module names
  return Object.fromEntries(
    Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
  );
};

const getNodeIcon = (node: any) => {
  // You can customize this based on node type, category, or module
  const category = (node.category || '').toLowerCase();
  const module = (node.module || '').toLowerCase();
  
  if (category === 'image' || module === 'image') {
    return <ImageIcon />;
  } else if (category === 'text' || module === 'text') {
    return <TextFieldsIcon />;
  } else if (category === 'data' || module === 'data') {
    return <DataObjectIcon />;
  } else if (category === 'settings' || module === 'settings') {
    return <SettingsIcon />;
  } else if (category === 'tools' || module === 'tools') {
    return <BuildIcon />;
  } else if (category === 'extension' || module === 'extension') {
    return <ExtensionIcon />;
  }
  
  return <AutoFixHighIcon />;
};

export default function LeftSidebar() {
  const theme = useTheme()
  const { nodeRegistry } = useNodeRegistryState(selectNodeRegistryState, shallow);
  const { mode, loadWorkflowFromStorage, updateLocalStorage } = useNodeState(
    state => ({ 
      mode: state.mode,
      loadWorkflowFromStorage: state.loadWorkflowFromStorage,
      updateLocalStorage: state.updateLocalStorage
    }), 
    shallow
  );

  const handleModeChange = (_: any, newMode: WorkflowType | null) => {
    console.log('Mode change attempted:', { newMode, currentMode: mode });
    if (!newMode || newMode === mode) return;
    
    try {
      // First load the new mode's data
      loadWorkflowFromStorage(newMode);
      // Then save the current state
      updateLocalStorage();
    } catch (error) {
      console.error('Error changing mode:', error);
    }
  };

  // Local node search state, the code will hide the nodes that don't match the search term instead of removing them from the DOM
  const [searchTerm, setSearchTerm] = useState('')
  const filteredNodes = useMemo(() => {
    const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    if (searchTerms.length === 0) return null;

    return Object.keys(nodeRegistry).filter((key) => {
      const label = nodeRegistry[key].label.toLowerCase();
      return searchTerms.every(term => label.includes(term));
    })
  }, [nodeRegistry, searchTerm])

  // Drag and drop functionality
  const onDragStart = (event: React.DragEvent<HTMLLIElement>, key: string) => {
    event.dataTransfer.setData('text/plain', key);
    event.dataTransfer.effectAllowed = 'move';
  }

  // Tab state
  const [tabValue, setTabValue] = useState(0);
  const handleTabChange = (_: any, newValue: number) => {
    setTabValue(newValue);
  };

  const groupedNodes = useMemo(() => {
    // First get the base grouped nodes
    const grouped = tabValue === 0 ? groupBy('module', nodeRegistry, mode) : groupBy('category', nodeRegistry, mode);

    // If there's a search filter, only include nodes that match
    if (filteredNodes) {
      return Object.fromEntries(
        Object.entries(grouped).map(([module, nodes]: [string, any]) => [
          module,
          nodes.filter((node: any) => filteredNodes.includes(node.key))
        ]).filter(([_, nodes]) => nodes.length > 0)
      );
    }

    return grouped;
  }, [nodeRegistry, filteredNodes, tabValue, mode]);

  return (
    <Box
      className="left-sidebar"
      textAlign="center"
      sx={{
        width: sidebarWidth,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.palette.background.paper,
        borderRight: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box sx={{ p: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <ToggleButtonGroup
          orientation="vertical"
          value={mode}
          exclusive
          onChange={handleModeChange}
          aria-label="mode switch"
          size="small"
          fullWidth
          sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            '& .MuiToggleButton-root': {
              flex: 1,
              padding: '8px',
              minHeight: '36px',
              border: `1px solid ${theme.palette.divider}`,
              '&:not(:first-of-type)': {
                borderTop: 'none'
              }
            }
          }}
        >
          <ToggleButton 
            value="workflow" 
            aria-label="workflow mode"
          >
            <BuildIcon />
          </ToggleButton>
          <ToggleButton 
            value="tool" 
            aria-label="tool mode"
          >
            <ColorLensIcon />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Box sx={{ width: '100%', borderBottom: `1px solid ${theme.palette.divider}`, p: 1.5 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{
            lineHeight: '16px',
            minHeight: 0,
            borderBottom: `1px solid ${theme.palette.divider}`,
            '.MuiButtonBase-root': { textTransform: 'none', lineHeight: '16px', minHeight: 0 }
          }}
        >
          <Tab label="Current" />
          <Tab label="New" />
        </Tabs>
        <OutlinedInput
          startAdornment={<SearchIcon fontSize="small" sx={{ marginRight: 1 }} />}
          id="main-module-search"
          placeholder="Search"
          size="small"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ width: '100%', fontSize: '14px', mt: 1 }}
        />
      </Box>
      <Box sx={{
        flex: 1,
        overflowY: 'auto',
        p: 0, m: 0,
      }}>
        {tabValue === 1 && searchTerm.trim() === "" ? (
          <Box sx={{ p: 2, textAlign: 'center', color: theme.palette.text.secondary }}>
            Enter text to start searching
          </Box>
        ) : (
          <Box sx={{ p: 0, pb: 0, m: 0 }}>
            {Object.entries(groupedNodes).map(([module, nodes]: [string, any]) => (
              <Accordion disableGutters key={module} sx={{
                borderBottom: `1px solid ${theme.palette.divider}`,
                boxShadow: 'none',
                backgroundColor: theme.palette.background.paper,
                fontSize: 12,
                p: 0, m: 0,
                '&:before': { backgroundColor: 'transparent' },
                '.MuiAccordionSummary-root': {
                  backgroundColor: theme.palette.background.paper,
                  '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
                },
                '.MuiAccordionDetails-root': {
                  backgroundColor: theme.palette.background.paper,
                  padding: '8px 4px',
                },
              }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  {module.replace(/[_-]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}
                </AccordionSummary>
                <AccordionDetails>
                  <List dense={true} sx={{ p: 1.5, pt: 0, pb: 0, m: 0 }}>
                    {nodes.map((node: any) => (
                      <ListItem
                        key={node.key}
                        draggable
                        className={`${node.key} category-${node.category} module-${node.module}`}
                        onDragStart={(event) => onDragStart(event, node.key)}
                        sx={{
                          outline: `1px solid ${theme.palette.divider}`,
                          borderRadius: 1,
                          boxShadow: 3,
                          m: 0, mb: 1,
                          p: 0.5, pl: 1,
                          borderLeftWidth: '8px',
                          borderLeftStyle: 'solid',
                          cursor: 'grab',
                          display: !filteredNodes || filteredNodes.includes(node.key) ? 'flex' : 'none',
                        }}
                      >
                        <ListItemText primary={node.label || node.key} sx={{ '& .MuiTypography-root': { fontSize: 12 } }} />
                      </ListItem>
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}
