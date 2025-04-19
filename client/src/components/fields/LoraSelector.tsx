import React, { useState, useEffect, useRef } from 'react';
import { FieldProps } from '../NodeContent'; // <-- Standard Mellon props
import Box from '@mui/material/Box';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import ImageList from '@mui/material/ImageList';
import ImageListItem from '@mui/material/ImageListItem';
import Pagination from '@mui/material/Pagination';
import { styled } from '@mui/material/styles';
import LinkIcon from '@mui/icons-material/Link';
import CloseIcon from '@mui/icons-material/Close';
import CircularProgress from '@mui/material/CircularProgress';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckIcon from '@mui/icons-material/Check';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { Handle, Position } from '@xyflow/react';

// Icons
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SearchIcon from '@mui/icons-material/Search';

// ------------------------------------------------------
// Extend FieldProps to include any extra props you need.
// ------------------------------------------------------
interface LoraSelectorProps extends FieldProps {
  nodeActions?: {
    setParamValue?: (key: string, val: any) => void;
  };
  onSelect?: (lora: any) => void;
}

const StyledImage = styled('img')({
  width: '150px',
  height: '150px',
  objectFit: 'cover',
  borderRadius: 0
});

const SmallImage = styled('img')<{ selected?: boolean }>(({ theme, selected }) => ({
  width: '36px',
  height: '36px',
  objectFit: 'cover',
  borderRadius: 0,
  cursor: 'pointer',
  border: selected 
    ? `2px solid ${theme.palette.primary.main}`
    : '2px solid transparent',
  '&:hover': {
    border: `2px solid ${theme.palette.primary.main}`,
    opacity: 0.9
  }
}));

const ITEMS_PER_PAGE = 10;
const FALLBACK_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzMzMyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IiNmZmYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgYXZhaWxhYmxlPC90ZXh0Pjwvc3ZnPg==';

const LoraSelector: React.FC<LoraSelectorProps> = (props) => {
  const {
    fieldKey,
    value,          // Mellon-managed value (our currently selected Lora)
    style,          // Custom style object from Mellon
    disabled,       // Should render in disabled state?
    hidden,         // Should hide the entire component?
    label,          // Optional label to display
    updateStore,    // Callback to update the Mellon store
    nodeActions,    // Optional extra actions from your environment
    onSelect        // Optional callback if needed
  } = props;

  // The rest of your existing local component state:
  const [loras, setLoras] = useState<any[]>([]);
  const [filteredLoras, setFilteredLoras] = useState<any[]>([]);
  const [selectedType, setSelectedType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedImages, setSelectedImages] = useState<{ [key: string]: string }>({});
  const [selectedLora, setSelectedLora] = useState<any>(value); // reflect Mellon `value`
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollableContentRef = useRef<HTMLDivElement>(null);

  // Keep local state in sync with the Mellon-managed `value`
  useEffect(() => {
    setSelectedLora(value);
  }, [value]);

  // Wheel handler to prevent scroll from bubbling to ReactFlow
  const handleWheel = (e: WheelEvent) => {
    if (scrollableContentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollableContentRef.current;
      const isScrollingUp = e.deltaY < 0;
      const isScrollingDown = e.deltaY > 0;
      const isAtTop = scrollTop === 0;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight;

      // If we can scroll in the direction the user is trying to scroll,
      // or if we're at the boundaries, prevent the event from bubbling to ReactFlow
      if ((isScrollingUp && !isAtTop) || (isScrollingDown && !isAtBottom)) {
        e.stopPropagation();
      }
    }
  };

  // Attach wheel listener
  useEffect(() => {
    const el = scrollableContentRef.current;
    if (!el) return;
    const opts = { passive: false } as AddEventListenerOptions;

    el.addEventListener('wheel', handleWheel as any, opts);
    return () => {
      el.removeEventListener('wheel', handleWheel as any);
    };
  }, []);

  // Load data on mount
  useEffect(() => {
    const loadLoras = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Example: using VITE env var
        const serverUrl = `http://${import.meta.env.VITE_SERVER_ADDRESS}/api/loras`;
        console.log('Fetching LoRAs from:', serverUrl);

        const response = await fetch(serverUrl);
        console.log('Response status:', response.status);

        if (!response.ok) {
          throw new Error(`Failed to fetch LoRAs: ${response.status} ${response.statusText}`);
        }

        let data;
        try {
          data = await response.json();
          console.log('Raw data received:', data?.length ? `${data.length} items` : 'no items', data);
        } catch (parseError) {
          console.error('Failed to parse response:', parseError);
          throw new Error('Invalid JSON response from server');
        }

        // Ensure data is an array
        const lorasArray = Array.isArray(data) ? data : [];
        console.log('Processed LoRAs:', lorasArray.length);

        if (lorasArray.length === 0) {
          console.warn('No LoRAs found in the data');
        } else {
          console.log('First LoRA example:', lorasArray[0]);
        }

        setLoras(lorasArray);
        setFilteredLoras(lorasArray);

        // Initialize selected images with best_image_url for each LoRA
        const initialSelected: { [key: string]: string } = {};
        lorasArray.forEach((lora: any) => {
          initialSelected[lora.model_id] = lora.best_image_url;
        });
        setSelectedImages(initialSelected);

      } catch (error: any) {
        console.error('Error loading LoRAs:', error);
        setError(error.message);
        setLoras([]);
        setFilteredLoras([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadLoras();
  }, []);

  // Filter triggers
  useEffect(() => {
    if (!Array.isArray(loras)) {
      console.error('loras is not an array:', loras);
      return;
    }

    console.log('Filters changed:', { selectedType, searchQuery, showOnlySelected, totalLoras: loras.length });
    let filtered = [...loras];

    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter((lora) => lora.type_of_lora === selectedType);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((lora) => {
        const triggerWords = Array.isArray(lora.trigger_words)
          ? lora.trigger_words.join(' ')
          : String(lora.trigger_words || '');

        return (
          lora.description.toLowerCase().includes(query) ||
          lora.author.toLowerCase().includes(query) ||
          triggerWords.toLowerCase().includes(query) ||
          lora.model_id.toLowerCase().includes(query) ||
          lora.type_of_lora.toLowerCase().includes(query) ||
          (lora.repo_url || '').toLowerCase().includes(query)
        );
      });
    }

    // Filter by selected
    if (showOnlySelected && selectedLora) {
      filtered = filtered.filter((lora) => lora.model_id === selectedLora.model_id);
    }

    console.log('Setting filtered LoRAs:', filtered.length);
    setFilteredLoras(filtered);
    setPage(1);
  }, [selectedType, searchQuery, showOnlySelected, selectedLora, loras]);

  // On data changes, re-apply filters but do NOT reset page
  useEffect(() => {
    if (!Array.isArray(loras)) {
      console.error('loras is not an array:', loras);
      return;
    }
    console.log('Data changed, reapplying filters');
    let filtered = [...loras];

    // Reapply type
    if (selectedType !== 'all') {
      filtered = filtered.filter((lora) => lora.type_of_lora === selectedType);
    }
    // Reapply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((lora) => {
        const triggerWords = Array.isArray(lora.trigger_words)
          ? lora.trigger_words.join(' ')
          : String(lora.trigger_words || '');

        return (
          lora.description.toLowerCase().includes(query) ||
          lora.author.toLowerCase().includes(query) ||
          triggerWords.toLowerCase().includes(query) ||
          lora.model_id.toLowerCase().includes(query) ||
          lora.type_of_lora.toLowerCase().includes(query) ||
          (lora.repo_url || '').toLowerCase().includes(query)
        );
      });
    }
    setFilteredLoras(filtered);
    // Do not reset page here
  }, [loras]);

  const handleSelect = (lora: any) => {
    if (disabled) return; // Respect 'disabled': no selection

    console.log('LoraSelector - handleSelect - START', lora);

    // Locally store the selection
    setSelectedLora(lora);

    // Notify Mellon of the change
    updateStore?.(fieldKey, lora);

    // If your external environment also needs to know
    if (nodeActions?.setParamValue) {
      try {
        nodeActions.setParamValue('selectedLora', lora);
        console.log('Called nodeActions.setParamValue with:', lora);
      } catch (error) {
        console.error('Error calling setParamValue:', error);
      }
    }
    // If there's a custom callback
    if (onSelect) {
      onSelect(lora);
    }
  };

  const handleImageSelect = (loraId: string, imageUrl: string) => {
    if (disabled) return; // Respect 'disabled'
    setSelectedImages((prev) => ({ ...prev, [loraId]: imageUrl }));
  };

  const handlePageChange = (event: React.ChangeEvent<unknown>, newPage: number) => {
    setPage(newPage);
    if (scrollableContentRef.current) {
      scrollableContentRef.current.scrollTop = 0;
    }
  };

  const handleImageError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    (event.target as HTMLImageElement).src = FALLBACK_IMAGE;
  };

  const handleDeleteImage = async (e: React.MouseEvent, loraId: string, imageUrl: string) => {
    e.stopPropagation();
    if (disabled) return; // Respect 'disabled'

    const lora = loras.find((l) => l.model_id === loraId);
    if (!lora) return;

    // Remove from image_urls
    const updatedImageUrls = lora.image_urls.filter((url: string) => url !== imageUrl);

    // If we’re deleting the best_image_url, set a new one
    let newBestImageUrl = lora.best_image_url;
    if (imageUrl === lora.best_image_url) {
      if (updatedImageUrls.length > 0) {
        newBestImageUrl = updatedImageUrls[0];
      } else {
        console.error('Cannot delete the last image');
        return;
      }
    }

    // Attempt to save on server
    try {
      const response = await fetch(
        `http://${import.meta.env.VITE_SERVER_ADDRESS}/api/update-lora`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model_id: loraId,
            best_image_url: newBestImageUrl,
            image_urls: updatedImageUrls,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save changes');
      }

      const result = await response.json();

      // Update local state with server data
      if (result.data) {
        setLoras((prevLoras) => {
          const newLoras = [...prevLoras];
          const index = newLoras.findIndex((l) => l.model_id === loraId);
          if (index !== -1) {
            // server presumably returned updated items
            const updated = result.data.find((l: any) => l.model_id === loraId);
            if (updated) newLoras[index] = updated;
          }
          return newLoras;
        });
      } else {
        // fallback local update
        lora.best_image_url = newBestImageUrl;
        lora.image_urls = updatedImageUrls;
        setLoras([...loras]);
      }

      // If the user was viewing that image, update
      if (selectedImages[loraId] === imageUrl) {
        setSelectedImages((prev) => ({
          ...prev,
          [loraId]: newBestImageUrl
        }));
      }
    } catch (error) {
      console.error('Error saving changes:', error);
      // revert local changes if needed
      setLoras((prev) => [...prev]);
    }
  };

  const handleDeleteLora = async (e: React.MouseEvent, loraId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return; // Respect 'disabled'

    if (pendingDelete !== loraId) {
      setPendingDelete(loraId);
      // Clear after 3s
      setTimeout(() => {
        setPendingDelete(null);
      }, 3000);
      return;
    }
    // Confirm click
    setPendingDelete(null);

    // Attempt server delete
    try {
      console.log('Sending delete request...');
      const response = await fetch(
        `http://${import.meta.env.VITE_SERVER_ADDRESS}/api/delete-lora`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_id: loraId })
        }
      );

      let responseData;
      try {
        responseData = await response.json();
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        throw new Error('Invalid response from server');
      }

      if (!response.ok) {
        throw new Error(
          responseData?.detail ||
            responseData?.message ||
            `Failed to delete LoRA (${response.status})`
        );
      }

      // Update local state after success
      setLoras((prev) => prev.filter((lora) => lora.model_id !== loraId));
      setFilteredLoras((prev) => prev.filter((lora) => lora.model_id !== loraId));

      // Clear selection if we just deleted the selected one
      if (selectedLora?.model_id === loraId) {
        setSelectedLora(null);
        updateStore?.(fieldKey, null);
        if (nodeActions?.setParamValue) {
          nodeActions.setParamValue('selectedLora', null);
        }
        if (onSelect) onSelect(null);
      }
    } catch (error: any) {
      console.error('Error deleting LoRA:', error);
      alert('Failed to delete LoRA: ' + error.message);

      // Attempt refresh
      try {
        const response = await fetch(`http://${import.meta.env.VITE_SERVER_ADDRESS}/api/loras`);
        if (response.ok) {
          const data = await response.json();
          setLoras(data);
          setFilteredLoras(data);
        }
      } catch (refreshError) {
        console.error('Failed to refresh data:', refreshError);
      }
    }
  };

  const loraTypes = ['all', 'style', 'concept', 'character', 'technical'];

  const getChipColor = (type: string) => {
    switch (type) {
      case 'style':
        return 'primary';
      case 'concept':
        return 'success';
      case 'character':
        return 'secondary';
      default:
        return 'warning';
    }
  };

  // Pagination
  const safeFilteredLoras = Array.isArray(filteredLoras) ? filteredLoras : [];
  const pageCount = Math.ceil(safeFilteredLoras.length / ITEMS_PER_PAGE);
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const paginatedLoras = safeFilteredLoras.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleDeselect = () => {
    if (disabled) return; // Respect 'disabled'
    setSelectedLora(null);
    setShowOnlySelected(false);
    updateStore?.(fieldKey, null);
    if (nodeActions?.setParamValue) {
      nodeActions.setParamValue('selectedLora', null);
    }
    if (onSelect) {
      onSelect(null);
    }
  };

  const handleCopyTriggerWords = (e: React.MouseEvent, triggerWords: string, loraId: string) => {
    e.stopPropagation();
    if (disabled) return; // Respect 'disabled'
    navigator.clipboard.writeText(triggerWords).then(() => {
      setCopiedId(loraId);
      setTimeout(() => {
        setCopiedId(null);
      }, 1000);
    });
  };

  // -------------------------------------
  // If hidden, Mellon typically adds a CSS
  // class "mellon-hidden". We do that below.
  // -------------------------------------

  return (
    <Box
      key={fieldKey}
      data-key={fieldKey}
      // Merge style from Mellon with your own
      sx={{ width: '100%', display: 'flex', justifyContent: 'center', ...style }}
      className={`nodrag ${disabled ? 'mellon-disabled' : ''} ${hidden ? 'mellon-hidden' : ''}`}
    >
      {/* If you need a ReactFlow handle, keep it here: */}
      <Handle type="source" position={Position.Bottom} id="lora-url" style={{ bottom: 0 }} />

      {/* Inner container */}
      <Box
        sx={{
          p: 2,
          border: 1,
          borderColor: 'divider',
          borderRadius: 0,
          width: '750px',
          maxWidth: '100%'
        }}
      >
        {/* Optional Mellon label */}
        {label && (
          <Typography variant="body1" gutterBottom>
            {label}
          </Typography>
        )}

        {/* Fixed Header */}
        <Box sx={{ mb: 2 }}>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">LoRA Selection</Typography>
              <IconButton
                onClick={() => !disabled && setIsOpen(!isOpen)}
                size="small"
                disabled={disabled}
              >
                {isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Stack>

            {error && (
              <Box
                sx={{
                  p: 1,
                  bgcolor: 'error.light',
                  color: 'error.contrastText',
                  borderRadius: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1
                }}
              >
                <Typography variant="body2">
                  Error loading LoRAs: {error}
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => window.location.reload()}
                  sx={{ color: 'inherit' }}
                  disabled={disabled}
                >
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Box>
            )}

            <Collapse in={isOpen}>
              <Stack spacing={2}>
                <Stack direction="row" spacing={2}>
                  <Select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    size="small"
                    sx={{ width: 200 }}
                    disabled={isLoading || disabled}
                  >
                    {loraTypes.map((type) => (
                      <MenuItem key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                  <TextField
                    placeholder="Search LoRAs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    size="small"
                    fullWidth
                    disabled={isLoading || disabled}
                    InputProps={{
                      startAdornment: (
                        <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
                      )
                    }}
                  />
                </Stack>
              </Stack>
            </Collapse>
          </Stack>
        </Box>

        {/* Scrollable Content */}
        <Box
          ref={scrollableContentRef}
          sx={{
            maxHeight: 500,
            minHeight: 100,
            height: 'auto',
            overflow: 'auto',
            pr: 1,
            mr: -1,
            '&::-webkit-scrollbar': {
              width: '8px'
            },
            '&::-webkit-scrollbar-track': {
              background: '#f1f1f1',
              borderRadius: 0
            },
            '&::-webkit-scrollbar-thumb': {
              background: '#888',
              borderRadius: 0,
              '&:hover': {
                background: '#666'
              }
            }
          }}
        >
          {isLoading ? (
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <CircularProgress />
            </Box>
          ) : (
            <Stack spacing={2} sx={{ pr: 1 }}>
              {paginatedLoras.length > 0 ? (
                paginatedLoras.map((lora: any) => (
                  <Card
                    key={lora.model_id}
                    onClick={() => handleSelect(lora)}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      if (selectedLora?.model_id === lora.model_id) {
                        handleDeselect();
                      }
                    }}
                    sx={{
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      transition: 'box-shadow 0.2s, border-color 0.2s, background-color 0.2s',
                      borderWidth: 2,
                      borderStyle: 'solid',
                      borderColor:
                        selectedLora?.model_id === lora.model_id
                          ? 'primary.main'
                          : 'transparent',
                      backgroundColor:
                        selectedLora?.model_id === lora.model_id
                          ? 'action.selected'
                          : 'background.paper',
                      '&:hover': {
                        boxShadow: disabled ? 'none' : 4,
                        borderColor: disabled
                          ? 'transparent'
                          : selectedLora?.model_id === lora.model_id
                          ? 'primary.main'
                          : 'primary.light'
                      },
                      userSelect: 'none'
                    }}
                  >
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Stack spacing={2}>
                        <Stack direction="row" spacing={2}>
                          <Stack direction="row" spacing={1}>
                            <Box sx={{ position: 'relative' }}>
                              <StyledImage
                                src={selectedImages[lora.model_id] || lora.best_image_url}
                                alt={lora.description}
                                onError={handleImageError}
                              />
                              {!disabled && (
                                <IconButton
                                  size="small"
                                  onClick={(e) =>
                                    handleDeleteImage(
                                      e,
                                      lora.model_id,
                                      selectedImages[lora.model_id]
                                    )
                                  }
                                  sx={{
                                    position: 'absolute',
                                    top: 4,
                                    right: 4,
                                    bgcolor: 'background.paper',
                                    '&:hover': {
                                      bgcolor: 'action.hover'
                                    }
                                  }}
                                >
                                  <CloseIcon fontSize="small" />
                                </IconButton>
                              )}
                            </Box>
                            {lora.image_urls && lora.image_urls.length > 0 && (
                              <Stack
                                spacing={0}
                                direction="column"
                                alignItems="flex-start"
                                sx={{
                                  height: 150,
                                  '& > div': {
                                    height: 37.5
                                  }
                                }}
                              >
                                {[...Array(4)].map((_, index) => (
                                  <Box
                                    key={index}
                                    onClick={(e) => {
                                      if (disabled) return;
                                      if (lora.image_urls[index]) {
                                        e.stopPropagation();
                                        handleImageSelect(
                                          lora.model_id,
                                          lora.image_urls[index]
                                        );
                                      }
                                    }}
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      visibility: lora.image_urls[index]
                                        ? 'visible'
                                        : 'hidden'
                                    }}
                                  >
                                    {lora.image_urls[index] && (
                                      <SmallImage
                                        src={lora.image_urls[index]}
                                        alt={`Sample ${index + 1}`}
                                        loading="lazy"
                                        onError={handleImageError}
                                        selected={
                                          selectedImages[lora.model_id] ===
                                          lora.image_urls[index]
                                        }
                                      />
                                    )}
                                  </Box>
                                ))}
                              </Stack>
                            )}
                          </Stack>
                          <Stack spacing={1} flex={1}>
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                              justifyContent="space-between"
                            >
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Typography variant="subtitle1">
                                  {lora.model_id.split('/')[1]}
                                </Typography>
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                  <Typography variant="body2" color="text.secondary">
                                    by {lora.author}
                                  </Typography>
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      if (disabled) return;
                                      e.stopPropagation();
                                      window.open(lora.repo_url, '_blank');
                                    }}
                                    sx={{ p: 0.5 }}
                                  >
                                    <LinkIcon fontSize="small" />
                                  </IconButton>
                                </Stack>
                              </Stack>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Chip
                                  label={lora.type_of_lora}
                                  size="small"
                                  color={getChipColor(lora.type_of_lora)}
                                />
                                {!disabled && (
                                  <IconButton
                                    size="small"
                                    onClick={(e) => handleDeleteLora(e, lora.model_id)}
                                    sx={{
                                      '&:hover': {
                                        color:
                                          pendingDelete === lora.model_id
                                            ? 'success.main'
                                            : 'error.main'
                                      },
                                      color:
                                        pendingDelete === lora.model_id
                                          ? 'success.main'
                                          : 'inherit'
                                    }}
                                  >
                                    {pendingDelete === lora.model_id ? (
                                      <CheckIcon fontSize="small" />
                                    ) : (
                                      <CloseIcon fontSize="small" />
                                    )}
                                  </IconButton>
                                )}
                              </Stack>
                            </Stack>
                            <Typography
                              variant="body2"
                              sx={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }}
                            >
                              {lora.description}
                            </Typography>
                            {lora.trigger_words && (
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Typography variant="body2" color="text.secondary">
                                  Trigger words: {lora.trigger_words}
                                </Typography>
                                {!disabled && (
                                  <IconButton
                                    size="small"
                                    onClick={(e) =>
                                      handleCopyTriggerWords(e, lora.trigger_words, lora.model_id)
                                    }
                                    sx={{
                                      p: 0.25,
                                      color:
                                        copiedId === lora.model_id
                                          ? 'success.main'
                                          : 'text.secondary',
                                      '&:hover': {
                                        color:
                                          copiedId === lora.model_id
                                            ? 'success.main'
                                            : 'primary.main'
                                      }
                                    }}
                                  >
                                    {copiedId === lora.model_id ? (
                                      <CheckIcon sx={{ fontSize: 14 }} />
                                    ) : (
                                      <ContentCopyIcon sx={{ fontSize: 14 }} />
                                    )}
                                  </IconButton>
                                )}
                              </Stack>
                            )}
                            <Stack direction="row" spacing={2}>
                              <Typography variant="body2">❤️ {lora.likes}</Typography>
                              <Typography variant="body2">⬇️ {lora.downloads}</Typography>
                            </Stack>
                          </Stack>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Box
                  sx={{
                    p: 4,
                    textAlign: 'center',
                    color: 'text.secondary'
                  }}
                >
                  <Typography>
                    {error
                      ? 'Failed to load LoRAs'
                      : showOnlySelected
                      ? 'You are only showing selected'
                      : 'No LoRAs found'}
                  </Typography>
                </Box>
              )}
            </Stack>
          )}
        </Box>

        <Stack spacing={2} sx={{ mt: 2 }}>
          {!isLoading && pageCount > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Pagination
                count={pageCount}
                page={page}
                onChange={handlePageChange}
                color="primary"
                size="small"
              />
            </Box>
          )}

          {selectedLora && (
            <Box
              sx={{
                p: 1,
                bgcolor: 'action.selected',
                borderRadius: 0,
                border: 1,
                borderColor: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <Stack direction="row" spacing={2} alignItems="center" flex={1}>
                <Typography variant="body2">
                  Selected:{' '}
                  <strong>{selectedLora.model_id.split('/')[1]}</strong> by {selectedLora.author}
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={showOnlySelected}
                      onChange={(e) => !disabled && setShowOnlySelected(e.target.checked)}
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ userSelect: 'none' }}>
                      Only show selected
                    </Typography>
                  }
                  sx={{ ml: 0 }}
                />
              </Stack>
              <IconButton
                size="small"
                onClick={handleDeselect}
                sx={{
                  ml: 1,
                  '&:hover': {
                    color: 'error.main'
                  }
                }}
                disabled={disabled}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          )}
        </Stack>
      </Box>
    </Box>
  );
};

export default LoraSelector;
