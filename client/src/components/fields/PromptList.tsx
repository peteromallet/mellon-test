import React, { useState, useEffect, useRef } from 'react';
import {
  Stack,
  TextField,
  IconButton,
  Button,
  Paper,
  Box,
  Typography,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  InputAdornment
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import HeightIcon from '@mui/icons-material/Height';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import DoNotDisturbIcon from '@mui/icons-material/DoNotDisturb';
import DoNotDisturbOffIcon from '@mui/icons-material/DoNotDisturbOff';
import { FieldProps } from '../NodeContent';

interface PromptItem {
  text: string;
  hidden: boolean;
}

/**
 * PromptListField component:
 * - Accepts a list of text prompts in `value` (array of strings).
 * - Hides or shows prompts without losing them in local state.
 * - Synchronizes only the "visible" prompts back to Mellon via updateStore.
 */
const PromptListField = ({
  fieldKey,
  value,
  style,
  disabled,
  hidden,
  label,
  updateStore
}: FieldProps) => {
  // Convert incoming value to PromptItem array
  const parseValue = (val: any): PromptItem[] => {
    if (val && typeof val === 'object' && !Array.isArray(val) && 'prompts' in val) {
      return val.prompts;
    }
    if (Array.isArray(val)) {
      if (val.length > 0 && typeof val[0] === 'string') {
        // Handle legacy format (array of strings)
        return val.map(text => ({ text, hidden: false }));
      }
      return val;
    }
    return [{ text: '', hidden: false }];
  };

  const initialPrompts = parseValue(value);
  const [prompts, setPrompts] = useState<PromptItem[]>(initialPrompts);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [heightMode, setHeightMode] = useState<'flexible' | 'fixed'>('flexible');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [searchText, setSearchText] = useState<string>('');
  const inputRefs = useRef<HTMLInputElement[]>([]);
  const lastUpdateRef = useRef<string | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [expandedHiddenIndex, setExpandedHiddenIndex] = useState<number | null>(null);
  const [showIgnored, setShowIgnored] = useState<boolean>(true);

  /**
   * Whenever prompts change (locally), we only push the *visible* prompts
   * to the Mellon store (debounced).
   */
  const handlePromptChange = (index: number, newVal: string) => {
    const newPrompts = [...prompts];
    newPrompts[index] = { ...newPrompts[index], text: newVal };
    setPrompts(newPrompts);

    // Clear any pending updates
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // Debounce the downstream update
    updateTimeoutRef.current = setTimeout(() => {
      updateDownstreamPrompts(newPrompts);
    }, 100);
  };

  const updateDownstreamPrompts = (promptsList: PromptItem[]) => {
    // If there's a search active, mark non-matching prompts as hidden
    const updatedPrompts = promptsList.map(p => ({
      ...p,
      hidden: p.hidden || (searchText !== '' && !p.text.toLowerCase().includes(searchText.toLowerCase()))
    }));

    const finalPrompts = updatedPrompts.length > 0 ? updatedPrompts : [{ text: '', hidden: false }];
    lastUpdateRef.current = JSON.stringify(finalPrompts);

    // Persist all prompts locally (including hidden)
    localStorage.setItem(fieldKey, JSON.stringify(finalPrompts));

    // Pass the full prompt list (with hidden key intact) downstream.
    // Later, the execution logic can filter out prompts where hidden === true.
    updateStore?.(fieldKey, finalPrompts);
  };

  const addPrompt = () => {
    const newPrompts = [...prompts, { text: '', hidden: false }];
    setPrompts(newPrompts);
  };

  const removePrompt = (index: number) => {
    const newPrompts = prompts.filter((_, i) => i !== index);
    setPrompts(newPrompts);
    updateDownstreamPrompts(newPrompts);
  };

  const togglePromptVisibility = (index: number) => {
    const newPrompts = [...prompts];
    newPrompts[index] = { ...newPrompts[index], hidden: !newPrompts[index].hidden };
    setPrompts(newPrompts);
    updateDownstreamPrompts(newPrompts);
  };

  const showAllPrompts = () => {
    const newPrompts = prompts.map(p => ({ ...p, hidden: false }));
    setPrompts(newPrompts);
    updateDownstreamPrompts(newPrompts);
  };

  const ignoreAllPrompts = () => {
    const newPrompts = prompts.map(p => ({ ...p, hidden: true }));
    setPrompts(newPrompts);
    updateDownstreamPrompts(newPrompts);
  };

  const duplicatePrompt = (index: number) => {
    const newPrompts = [...prompts];
    newPrompts.splice(index + 1, 0, { ...prompts[index] });
    setPrompts(newPrompts);
    updateDownstreamPrompts(newPrompts);
  };

  /**
   * Keyboard shortcuts / navigation
   */
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (editingIndex === index) {
      e.stopPropagation();
      e.nativeEvent?.stopImmediatePropagation?.();

      if (e.key === 'Tab') {
        e.preventDefault();
        const nextIndex = e.shiftKey ? index - 1 : index + 1;
        if (nextIndex >= 0 && nextIndex < prompts.length) {
          inputRefs.current[nextIndex]?.focus();
          setFocusedIndex(nextIndex);
          setEditingIndex(nextIndex);
          if (prompts[nextIndex]?.hidden) {
            setExpandedHiddenIndex(nextIndex);
          }
        }
      } else if (e.key === 'Escape') {
        setEditingIndex(null);
        inputRefs.current[index]?.blur();
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const nextIndex = e.shiftKey ? index - 1 : index + 1;
      if (nextIndex >= 0 && nextIndex < prompts.length) {
        inputRefs.current[nextIndex]?.focus();
        setFocusedIndex(nextIndex);
        if (prompts[nextIndex]?.hidden) {
          setExpandedHiddenIndex(nextIndex);
        }
      } else if (!e.shiftKey && nextIndex >= prompts.length) {
        addPrompt();
        setTimeout(() => {
          const newIndex = prompts.length;
          inputRefs.current[newIndex]?.focus();
          setFocusedIndex(newIndex);
        }, 0);
      }
    } else if ((e.key === 'w' || e.key === 'Enter') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      setEditingIndex(index);
    } else if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      duplicatePrompt(index);
      setTimeout(() => {
        inputRefs.current[index + 1]?.focus();
        setFocusedIndex(index + 1);
      }, 0);
    } else if (e.key === 'd' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (prompts.length > 1) {
        const nextFocusIndex = index === prompts.length - 1 ? index - 1 : index;
        removePrompt(index);
        setTimeout(() => {
          inputRefs.current[nextFocusIndex]?.focus();
          setFocusedIndex(nextFocusIndex);
          if (prompts[nextFocusIndex]?.hidden) {
            setExpandedHiddenIndex(nextFocusIndex);
          }
        }, 0);
      }
    } else if (e.key === 'h' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      togglePromptVisibility(index);
    } else if (e.key === 'a' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      addPrompt();
      setTimeout(() => {
        const newIndex = prompts.length;
        inputRefs.current[newIndex]?.focus();
        setFocusedIndex(newIndex);
      }, 0);
    }
  };

  const handleBlur = (index: number) => {
    setFocusedIndex(null);
    setEditingIndex(null);
    setExpandedHiddenIndex(null);
  };

  const handleFocus = (index: number) => {
    setFocusedIndex(index);
    if (prompts[index].hidden) {
      setExpandedHiddenIndex(index);
    }
  };

  /**
   * If `value` updates externally (Mellon store changes), update local prompts
   * (unless it's the same as our last update).
   */
  useEffect(() => {
    console.log("[PromptListField] useEffect triggered by 'value' change.");
    console.log("  -> Received value prop:", value);
    
    if (!Array.isArray(value)) {
      console.log("  -> Incoming value is not an array, skipping state update.");
      return;
    }

    // Directly parse and set the state based on the incoming value prop.
    // React's dependency array [value] ensures this runs when the prop changes.
    // We rely on React to optimize if the parsed value results in the same state.
    const newState = parseValue(value);
    console.log("  -> Parsed new state:", newState);
    console.log("  -> Setting component state...");
    setPrompts(newState);
    
    // Clear lastUpdateRef when state is driven externally
    lastUpdateRef.current = null; 

  }, [value]);

  /**
   * Keep input refs array in sync with # of prompts
   */
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, prompts.length);
  }, [prompts]);

  /**
   * Cleanup timeout on unmount
   */
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Added drag-and-drop and reorder functions for prompt reordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    const newPrompts = [...prompts];
    const [removed] = newPrompts.splice(draggedIndex, 1);
    newPrompts.splice(dropIndex, 0, removed);
    setPrompts(newPrompts);
    updateDownstreamPrompts(newPrompts);
    setDraggedIndex(null);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedIndex(null);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newPrompts = [...prompts];
    [newPrompts[index - 1], newPrompts[index]] = [newPrompts[index], newPrompts[index - 1]];
    setPrompts(newPrompts);
    updateDownstreamPrompts(newPrompts);
  };

  const moveDown = (index: number) => {
    if (index === prompts.length - 1) return;
    const newPrompts = [...prompts];
    [newPrompts[index], newPrompts[index + 1]] = [newPrompts[index + 1], newPrompts[index]];
    setPrompts(newPrompts);
    updateDownstreamPrompts(newPrompts);
  };

  // Filter prompts based on search text
  const filteredPrompts = prompts.filter(prompt => {
    if (searchText) {
      return prompt.text.toLowerCase().includes(searchText.toLowerCase()) && (showIgnored || !prompt.hidden);
    }
    return showIgnored ? true : !prompt.hidden;
  });

  // Clear search text and update downstream to show all prompts again
  const clearSearch = () => {
    setSearchText('');
    // Update downstream to remove search-based hiding
    updateDownstreamPrompts(prompts);
  };

  // Update downstream when search changes to hide/show prompts
  useEffect(() => {
    updateDownstreamPrompts(prompts);
  }, [searchText]);

  // Get an indicator if search is affecting visibility
  const isSearchFiltering = searchText !== '' && filteredPrompts.length < prompts.length;

  // If hidden, you can choose to return null OR just apply the 'mellon-hidden' class:
  // returning null means it won't render at all.
  // We'll just add the 'mellon-hidden' class to match the Mellon examples.
  return (
    <Box
      key={fieldKey}
      data-key={fieldKey}
      sx={{ p: '8px 16px', position: 'relative', minWidth: 450, ...style }}
      className={`nodrag ${disabled ? 'mellon-disabled' : ''} ${hidden ? 'mellon-hidden' : ''}`}
    >
      {/* Optional label at the top */}
      {label && (
        <Typography variant="body1" gutterBottom>
          {label}
        </Typography>
      )}

      {/* Top bar with height-mode toggle and Ignore/Show All, plus help tooltip */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1.5,
          mt: 0.5
        }}
      >
        <ToggleButtonGroup
          value={heightMode}
          exclusive
          onChange={(_, newMode) => {
            if (newMode) setHeightMode(newMode);
          }}
          size="small"
          disabled={disabled}
          sx={{
            '& .MuiToggleButton-root': {
              px: 2,
              py: 0.5,
              textTransform: 'none',
              fontSize: '0.875rem'
            }
          }}
        >
          <ToggleButton value="flexible" aria-label="flexible height">
            <HeightIcon sx={{ mr: 1, transform: 'rotate(90deg)' }} fontSize="small" />
            Flexible
          </ToggleButton>
          <ToggleButton value="fixed" aria-label="fixed height">
            <HeightIcon sx={{ mr: 1 }} fontSize="small" />
            Fixed
          </ToggleButton>
        </ToggleButtonGroup>

        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            size="small"
            onClick={prompts.every(p => p.hidden) ? showAllPrompts : ignoreAllPrompts}
            disabled={disabled}
            startIcon={
              prompts.every(p => p.hidden) ? (
                <VisibilityIcon />
              ) : (
                <VisibilityOffIcon />
              )
            }
            sx={{
              textTransform: 'none',
              fontSize: '0.875rem'
            }}
          >
            {prompts.every(p => p.hidden) ? 'Show All' : 'Ignore All'}
          </Button>

          <Tooltip
            title={
              <Box sx={{ p: 1, fontSize: '0.875rem' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Keyboard Shortcuts
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                  <li>Tab - Move between fields</li>
                  <li>W or Enter - Start editing</li>
                  <li>Esc - Stop editing</li>
                  <li>C - Duplicate field</li>
                  <li>D - Delete field</li>
                  <li>H - Hide/show field</li>
                  <li>A - Add new prompt</li>
                </Box>
              </Box>
            }
            arrow
            placement="right"
          >
            <IconButton
              disabled={disabled}
              sx={{
                color: '#999999',
                '&:hover': {
                  color: '#FFA500'
                }
              }}
            >
              <InfoOutlinedIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Search Bar */}
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search prompts..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          disabled={disabled}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: searchText && (
              <InputAdornment position="end">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <IconButton
                    size="small"
                    onClick={clearSearch}
                    sx={{ visibility: searchText ? 'visible' : 'hidden' }}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </Box>
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '6px',
              backgroundColor: '#f5f5f5',
              '&:hover': {
                backgroundColor: '#eeeeee',
              },
              '&.Mui-focused': {
                backgroundColor: '#ffffff',
              }
            }
          }}
        />
      </Box>

      {(searchText || prompts.some(p => p.hidden)) && (
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', padding: '4px 8px', borderRadius: '4px' }}>
          <Typography variant="caption" sx={{ mr: 1 }}>
            {searchText
              ? `${filteredPrompts.filter(p => !p.hidden).length} active, ${prompts.filter(p => !p.hidden).length - filteredPrompts.filter(p => !p.hidden).length} not in search, ${prompts.filter(p => p.hidden).length} ignored`
              : `${prompts.filter(p => !p.hidden).length} active, ${prompts.filter(p => p.hidden).length} ignored`
            }
          </Typography>
          <Button
            size="small"
            onClick={() => setShowIgnored(!showIgnored)}
            disabled={disabled}
            sx={{ textTransform: 'none', fontSize: '0.75rem' }}
          >
            {showIgnored ? 'Hide Ignored' : 'Show Ignored'}
          </Button>
        </Box>
      )}

      {/* The prompt list - using filtered prompts */}
      <Stack spacing={1}>
        {filteredPrompts.length > 0 ? (
          filteredPrompts.map((prompt, index) => {
            // Find the original index in the full prompts array for operations
            const originalIndex = prompts.findIndex(p => p === prompt);
            
            // Determine if the prompt is manually ignored; it will appear greyed out via opacity if so
            const isManuallyHidden = prompt.hidden;
            const isExpanded = hoveredIndex === originalIndex || expandedHiddenIndex === originalIndex;
            
            return (
              <Paper
                key={originalIndex}
                elevation={1}
                sx={{
                  p: 1,
                  position: 'relative',
                  opacity: isManuallyHidden ? 0.5 : 1,
                  transition: 'all 0.2s ease-in-out',
                  cursor: editingIndex === originalIndex ? 'text' : 'default',
                  ...(focusedIndex === originalIndex && {
                    outline:
                      editingIndex === originalIndex
                        ? '2px solid rgba(76, 175, 80, 0.5)'
                        : '2px solid rgba(25, 118, 210, 0.5)',
                    outlineOffset: '2px'
                  })
                }}
                onMouseEnter={() => setHoveredIndex(originalIndex)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      mr: 1,
                      cursor: !disabled ? 'grab' : 'default',
                      opacity: hoveredIndex === originalIndex ? 1 : 0.3,
                      transition: 'opacity 0.3s'
                    }}
                    draggable={!disabled}
                    onDragStart={(e: React.DragEvent) => handleDragStart(e, originalIndex)}
                    onDragOver={handleDragOver}
                    onDrop={(e: React.DragEvent) => handleDrop(e, originalIndex)}
                    onDragEnd={handleDragEnd}
                  >
                    <IconButton onClick={() => moveUp(originalIndex)} disabled={originalIndex === 0 || disabled} size="small">
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                    <DragIndicatorIcon fontSize="small" />
                    <IconButton onClick={() => moveDown(originalIndex)} disabled={originalIndex === prompts.length - 1 || disabled} size="small">
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <Box sx={{ flex: 1, position: 'relative' }}>
                    <TextField
                      inputRef={(el) => (inputRefs.current[originalIndex] = el!)}
                      size="small"
                      placeholder={
                        editingIndex === originalIndex
                          ? 'Enter a text prompt'
                          : "Press 'w' or double-click to edit"
                      }
                      value={prompt.text}
                      onChange={(e) => {
                        if (editingIndex === originalIndex && !disabled) {
                          handlePromptChange(originalIndex, e.target.value);
                        }
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        e.nativeEvent?.stopImmediatePropagation?.();
                        handleKeyDown(e, originalIndex);
                      }}
                      onFocus={() => handleFocus(originalIndex)}
                      onBlur={() => handleBlur(originalIndex)}
                      onDoubleClick={() => {
                        if (!disabled) setEditingIndex(originalIndex);
                      }}
                      fullWidth
                      multiline
                      rows={
                        editingIndex === originalIndex
                          ? undefined
                          : heightMode === 'fixed'
                          ? 3
                          : undefined
                      }
                      maxRows={
                        editingIndex === originalIndex
                          ? Infinity
                          : heightMode === 'flexible'
                          ? Infinity
                          : undefined
                      }
                      minRows={
                        editingIndex === originalIndex
                          ? 1
                          : heightMode === 'flexible'
                          ? 1
                          : undefined
                      }
                      disabled={disabled}
                      InputProps={{
                        readOnly: editingIndex !== originalIndex,
                        onKeyDown: (e) => {
                          e.stopPropagation();
                          e.nativeEvent?.stopImmediatePropagation?.();
                        },
                        sx: {
                          transition: 'all 0.2s ease-in-out',
                          ...(heightMode === 'fixed' &&
                            editingIndex !== originalIndex && {
                              height: '85px',
                              '& textarea': {
                                overflow: 'auto'
                              }
                            }),
                          ...(heightMode === 'flexible' &&
                            editingIndex !== originalIndex && {
                              height: 'auto',
                              '& textarea': {
                                overflow: 'hidden'
                              }
                            }),
                          ...(editingIndex === originalIndex && {
                            height: 'auto',
                            '& textarea': {
                              overflow: 'hidden'
                            }
                          })
                        }
                      }}
                      sx={{
                        transition: 'all 0.2s ease-in-out',
                        '& .MuiInputBase-input': {
                          cursor: editingIndex === originalIndex ? 'text' : 'default'
                        }
                      }}
                    />
                    {hoveredIndex === originalIndex && !disabled && (
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          display: 'flex',
                          gap: 0.5
                        }}
                      >
                        <IconButton
                          onClick={() => duplicatePrompt(originalIndex)}
                          color="primary"
                          size="small"
                          sx={{
                            opacity: 0.7,
                            '&:hover': { opacity: 1 }
                          }}
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          onClick={() => togglePromptVisibility(originalIndex)}
                          color="primary"
                          size="small"
                          sx={{
                            opacity: 0.7,
                            '&:hover': { opacity: 1 }
                          }}
                        >
                          {prompt.hidden ? (
                            <DoNotDisturbIcon fontSize="small" />
                          ) : (
                            <DoNotDisturbOffIcon fontSize="small" />
                          )}
                        </IconButton>
                        {prompts.length > 1 && (
                          <IconButton
                            onClick={() => removePrompt(originalIndex)}
                            color="error"
                            size="small"
                            sx={{
                              opacity: 0.7,
                              '&:hover': { opacity: 1 }
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    )}
                  </Box>
                </Box>
              </Paper>
            );
          })
        ) : (
          <Paper elevation={0} sx={{ p: 3, textAlign: 'center', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
            <Typography variant="body2" color="text.secondary">
              No prompts match your search
            </Typography>
          </Paper>
        )}
      </Stack>

      {/* Rearranged footer */}
      {!disabled && (
        <Box sx={{ mt: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Button
              startIcon={<AddIcon />}
              onClick={addPrompt}
              variant="outlined"
              disabled={disabled}
            >
              Add Prompt
            </Button>
          </Box>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {searchText ? 
                `${prompts.filter(p => p.hidden).length} ignored, ${prompts.filter(p => !p.hidden).length - filteredPrompts.filter(p => !p.hidden).length} not in search, ${filteredPrompts.filter(p => !p.hidden).length} for execution` : 
                `${prompts.filter(p => p.hidden).length} ignored, ${prompts.filter(p => !p.hidden).length} for execution`
              }
            </Typography>
          </Box>
          <Box sx={{ mt: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button
              size="small"
              onClick={() => setShowIgnored(!showIgnored)}
              disabled={disabled}
              sx={{ 
                textTransform: 'none', 
                fontSize: '0.75rem',
                minWidth: 0,
                padding: '2px 4px',
                color: 'text.secondary',
                '&:hover': {
                  background: 'none',
                  color: 'primary.main'
                }
              }}
            >
              {showIgnored ? 'Hide Ignored' : 'Show Ignored'}
            </Button>
            <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>|</Typography>
            <Button
              size="small"
              onClick={clearSearch}
              disabled={disabled || !searchText}
              sx={{ 
                textTransform: 'none', 
                fontSize: '0.75rem',
                minWidth: 0,
                padding: '2px 4px',
                color: 'text.secondary',
                '&:hover': {
                  background: 'none',
                  color: 'primary.main'
                }
              }}
            >
              Clear Search
            </Button>
            <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>|</Typography>
            <Button
              size="small"
              onClick={showAllPrompts}
              disabled={disabled || !prompts.some(p => p.hidden)}
              sx={{ 
                textTransform: 'none', 
                fontSize: '0.75rem',
                minWidth: 0,
                padding: '2px 4px',
                color: 'text.secondary',
                '&:hover': {
                  background: 'none',
                  color: 'primary.main'
                }
              }}
            >
              Unignore All
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default PromptListField;
