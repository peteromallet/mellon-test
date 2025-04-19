import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Box,
  ImageList,
  ImageListItem,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Pagination,
  TextField,
  Skeleton,
  Fade,
  Modal,
  ToggleButtonGroup,
  ToggleButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Tooltip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SortIcon from '@mui/icons-material/Sort';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DownloadIcon from '@mui/icons-material/Download';
import InfoIcon from '@mui/icons-material/Info';

import { useNodeState } from '../../stores/nodeStore';
import dataService from '../../services/dataService';
import config from '../../../config';
import { FieldProps } from '../NodeContent'; // Standard Mellon FieldProps import

interface ImageObject {
  filename: string;
  starred: boolean;
  prompt: string;
}

interface GalleryData {
  nodeId?: string;
  params?: {
    component?: string;
    files?: ImageObject[];
    output?: {
      success?: boolean;
      filename?: string;
    };
    imageSize?: string;
    sortOrder?: 'newest' | 'oldest' | 'custom';
    itemsPerPage?: number;
    numColumns?: number;
    page?: number;
    showStarredOnly?: boolean;
    searchTerm?: string;
  };
  files?: string[];
}

interface SelectedImage {
  url: string;
  prompt: string;
  isVideo?: boolean;
}

const ITEMS_PER_PAGE_OPTIONS = [16, 32, 64, 128];
const IMAGE_SIZES = {
  small: 100,
  medium: 150,
  large: 200,
} as const;
const COLUMNS_OPTIONS = [2, 3, 4, 5, 6];

type ImageSize = keyof typeof IMAGE_SIZES;

const Gallery = ({ fieldKey, value, style, disabled, hidden, label, updateStore }: FieldProps) => {
  console.log('[Gallery] Rendering. Props fieldKey=', fieldKey);
  console.log('[Gallery] The value prop is:', value);

  const galleryData: GalleryData =
    value && typeof value === 'object'
      ? ((value as any).value || value)
      : ({} as GalleryData);

  const imageRefs = useRef<Record<string, HTMLImageElement>>({});
  const originalOrder = useRef<ImageObject[]>([]);
  const lastGeneratedImage = useRef<string | null>(null);

  const setParamValue = useNodeState((state: any) => state.setParamValue);
  const [isDeletingImage, setIsDeletingImage] = React.useState<number | null>(null);
  const [imageUrls, setImageUrls] = React.useState<Record<string, string>>({});
  const [displayedImages, setDisplayedImages] = React.useState<ImageObject[]>([]);
  const [sortOrder, setSortOrder] = React.useState<'newest' | 'oldest' | 'custom'>(
    galleryData?.params?.sortOrder || 'oldest'
  );
  const [itemsPerPage, setItemsPerPage] = React.useState(
    galleryData?.params?.itemsPerPage || 16
  );
  const [numColumns, setNumColumns] = React.useState(
    galleryData?.params?.numColumns || 4
  );
  const [page, setPage] = React.useState(
    galleryData?.params?.page || 1
  );
  const [loadedImages, setLoadedImages] = React.useState<Record<string, boolean>>({});
  const [selectedImage, setSelectedImage] = React.useState<SelectedImage | null>(null);

  // Index of the currently selected image within the *displayed* images
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  // Local states for editing the prompt
  const [editedPrompt, setEditedPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState('');

  const [searchTerm, setSearchTerm] = React.useState(
    galleryData?.params?.searchTerm || ''
  );

  const [imageSize, setImageSize] = React.useState<ImageSize>(
    (galleryData?.params?.imageSize as ImageSize) || 'small'
  );
  const [isDraggingOver, setIsDraggingOver] = React.useState(false);
  const [starredImages, setStarredImages] = React.useState<Set<string>>(new Set());
  const [showStarredOnly, setShowStarredOnly] = React.useState(
    galleryData?.params?.showStarredOnly || false
  );
  const [copySuccess, setCopySuccess] = React.useState(false);
  const [deleteNonStarredDialogOpen, setDeleteNonStarredDialogOpen] = React.useState(false);
  const [isDeletingNonStarred, setIsDeletingNonStarred] = React.useState(false);
  const [isDraggingMedia, setIsDraggingMedia] = React.useState(false);
  const [thumbnailCopySuccess, setThumbnailCopySuccess] = React.useState<Record<string, boolean>>({});

  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);
  const [mediaWidth, setMediaWidth] = useState<number>(0);

  const dragCounter = useRef(0);

  // Whenever selectedImage changes, set up the local prompt states.
  useEffect(() => {
    if (selectedImage) {
      setEditedPrompt(selectedImage.prompt || '');
      setOriginalPrompt(selectedImage.prompt || '');
    } else {
      setEditedPrompt('');
      setOriginalPrompt('');
    }
  }, [selectedImage]);

  // Effect to set cursor position in prompt input when modal opens
  useEffect(() => {
    // When the modal opens (selectedImage is set)
    if (selectedImage) {
      console.log('[Gallery] useEffect for cursor: selectedImage is set, scheduling focus attempt.');
      // Use a timeout to ensure the autoFocus/mounting has likely completed
      // and the element is ready for selection manipulation.
      const timer = setTimeout(() => {
        console.log('[Gallery] setTimeout callback: Checking ref...');
        // Check for the ref *inside* the timeout
        if (promptInputRef.current) {
          console.log('[Gallery] setTimeout callback: Ref exists.');
          const length = promptInputRef.current.value.length;
          console.log(`[Gallery] setTimeout callback: Prompt length is ${length}.`);
          console.log('[Gallery] setTimeout callback: Calling focus().');
          promptInputRef.current.focus(); // Ensure focus first
          console.log('[Gallery] setTimeout callback: Calling setSelectionRange().');
          promptInputRef.current.setSelectionRange(length, length);
          console.log('[Gallery] Prompt input focused, cursor set to end.');
        } else {
          console.log('[Gallery] setTimeout callback: Ref was null!');
        }
      }, 100); // Increased delay slightly just in case

      return () => {
        console.log('[Gallery] Cleanup: Clearing timeout.');
        clearTimeout(timer);
      };
    } else {
        console.log('[Gallery] useEffect for cursor: selectedImage is null, effect skipped.');
    }
  }, [selectedImage]);

  const updateMediaWidth = useCallback(() => {
    if (mediaRef.current) {
      setMediaWidth(mediaRef.current.offsetWidth);
    }
  }, []);

  useEffect(() => {
    if (selectedImage) {
      setMediaWidth(0);
      const observer = new ResizeObserver(updateMediaWidth);
      if (mediaRef.current) {
        observer.observe(mediaRef.current);
      }
      return () => observer.disconnect();
    }
  }, [selectedImage, updateMediaWidth]);

  const isVideoFile = (filename: string): boolean => {
    const lower = filename.toLowerCase();
    return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.ogg');
  };

  useEffect(() => {
    console.log('[Gallery] useEffect: galleryData changed:', galleryData);
  }, [galleryData]);

  /**
   * If a new image has been generated (params.output.success && params.output.filename),
   * we add it to the gallery and force "oldest" sort so it shows up last.
   */
  useEffect(() => {
    if (galleryData?.params?.output?.success && galleryData?.params?.output?.filename) {
      const newFilename = galleryData.params.output.filename;
      console.log('[Gallery] useEffect: Detected a newly generated image =>', newFilename);

      // If that file isn't already in our gallery, add it:
      const alreadyExists = originalOrder.current.some(img => img.filename === newFilename);
      if (!alreadyExists) {
        const newObj: ImageObject = {
          filename: newFilename,
          starred: false,
          prompt: ''
        };
        originalOrder.current.push(newObj);

        // Load the new file
        loadImage(newFilename);

        // Force sort to oldest & jump to last page
        setSortOrder('oldest');
        const sorted = refreshDisplayedImages(originalOrder.current);
        const totalPages = Math.ceil(sorted.length / itemsPerPage);
        setPage(totalPages);

        // Save to store
        updateSettingsInStore({
          files: originalOrder.current,
          sortOrder: 'oldest',
          page: totalPages
        });
      }
    }
  }, [galleryData]);

  // Function to re-filter, re-sort, and then set displayedImages in one place
  const refreshDisplayedImages = useCallback(
    (sourceArray: ImageObject[]) => {
      // 1) Filter if showStarredOnly
      let filtered = showStarredOnly
        ? sourceArray.filter((img) => img.starred)
        : [...sourceArray];

      // 2) Filter by searchTerm
      if (searchTerm.trim() !== '') {
        filtered = filtered.filter(
          (img: ImageObject) =>
            (img.prompt && img.prompt.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (img.filename && img.filename.toLowerCase().includes(searchTerm.toLowerCase()))
        );
      }

      // 3) Sort
      // 'newest' means the last in original order is shown first, so reverse the array
      let sorted = sortOrder === 'newest' ? [...filtered].reverse() : [...filtered];

      setDisplayedImages(sorted);
      return sorted;
    },
    [showStarredOnly, searchTerm, sortOrder]
  );

  // load images from either params.files or fallback to galleryData.files
  useEffect(() => {
    console.log('[Gallery] useEffect: reading files from galleryData.params.files or galleryData.files');

    let savedImages: ImageObject[] = [];
    
    // Only update from galleryData if it actually has files
    if (galleryData?.params?.files && Array.isArray(galleryData.params.files) && galleryData.params.files.length > 0) {
      savedImages = galleryData.params.files;
      originalOrder.current = savedImages;
    } else if (galleryData?.files && Array.isArray(galleryData.files) && galleryData.files.length > 0) {
      savedImages = galleryData.files.map((filename: string) => ({
        filename,
        starred: false,
        prompt: ''
      }));
      originalOrder.current = savedImages;
    }
    // If galleryData has no files but we have local files, keep using those
    else if (originalOrder.current.length > 0) {
      savedImages = originalOrder.current;
    }

    console.log('[Gallery] => computed savedImages length:', savedImages.length);

    // Load any images that aren't already loaded
    savedImages.forEach((img) => {
      const baseFileName = img.filename.includes('/') ? img.filename.split('/').pop() : img.filename;
      if (baseFileName && !imageUrls[baseFileName]) {
        loadImage(img.filename);
      }
    });

    refreshDisplayedImages(savedImages);
  }, [
    galleryData?.files,
    galleryData?.params?.files,
    imageUrls,
    showStarredOnly,
    sortOrder,
    searchTerm,
    refreshDisplayedImages
  ]);

  useEffect(() => {
    if (
      galleryData?.params?.imageSize &&
      (galleryData.params.imageSize === 'small' ||
        galleryData.params.imageSize === 'medium' ||
        galleryData.params.imageSize === 'large')
    ) {
      setImageSize(galleryData.params.imageSize as ImageSize);
    }
  }, [galleryData?.params?.imageSize]);

  const updateSettingsInStore = (updates: Partial<GalleryData['params']>) => {
    console.log('[Gallery updateSettingsInStore] Preparing to update store with updates:', updates);
    const newValue = {
      params: {
        ...((galleryData && galleryData.params) || {}),
        component: 'ui_gallery',
        files: originalOrder.current,
        ...updates
      }
    };
    console.log('[Gallery updateSettingsInStore] Constructed newValue:', newValue);
    if (updateStore) {
        console.log('[Gallery updateSettingsInStore] Calling updateStore prop function.');
        updateStore(fieldKey, newValue);
    } else {
        console.error('[Gallery updateSettingsInStore] Error: updateStore prop is missing!');
    }
  };

  /**
   * We change the labeling to reflect the current sort mode:
   * If sortOrder === 'newest', the button text will read "Newest First".
   * If 'oldest', it will read "Oldest First".
   */
  const handleSortChange = (event: any, newSortOrder: 'newest' | 'oldest' | 'custom') => {
    if (newSortOrder !== null) {
      setSortOrder(newSortOrder);
      refreshDisplayedImages(originalOrder.current);
      updateSettingsInStore({ sortOrder: newSortOrder });
    }
  };

  const handlePageChange = (event: any, value: number) => {
    setPage(value);
    updateSettingsInStore({ page: value });
  };

  const totalPages = Math.ceil(displayedImages.length / itemsPerPage);
  const currentPageImages = displayedImages.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  const loadImage = async (imageName: string): Promise<string | null> => {
    try {
      const baseFileName = imageName.includes('/')
        ? imageName.split('/').pop()
        : imageName;
      if (!baseFileName) {
        return null;
      }
      const imageUrl = `http://${config.serverAddress}/data/files/${baseFileName}`;
      setImageUrls((prev) => {
        if (prev[baseFileName]) {
          return prev;
        }
        return { ...prev, [baseFileName]: imageUrl };
      });
      return imageUrl;
    } catch (error) {
      console.error('[Gallery] Error in loadImage:', error);
      return null;
    }
  };

  const handleDelete = async (index: number): Promise<void> => {
    const actualIndex = (page - 1) * itemsPerPage + index;
    if (isDeletingImage === actualIndex) return;
    setIsDeletingImage(actualIndex);

    try {
      const imageObj = displayedImages[actualIndex];
      if (!imageObj) {
        return;
      }
      const filename = imageObj.filename;
      const baseFilename = filename.includes('/') ? filename.split('/').pop() : filename;

      if (baseFilename) {
        setImageUrls((prev) => {
          const newUrls = { ...prev };
          delete newUrls[baseFilename];
          return newUrls;
        });

        try {
          await dataService.deleteNodeFile(galleryData.nodeId || '', baseFilename);
        } catch (err) {
          console.error('[Gallery] handleDelete => Error deleting file from server:', err);
        }

        originalOrder.current = originalOrder.current.filter(
          (img) => img.filename !== filename
        );

        refreshDisplayedImages(originalOrder.current);

        updateSettingsInStore({
          files: originalOrder.current,
        });
      }
    } finally {
      setIsDeletingImage(null);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setIsDraggingMedia(true);
    const actualIndex = (page - 1) * itemsPerPage + index;
    const imageObj = displayedImages[actualIndex];
    if (!imageObj || !imageObj.filename) {
      return;
    }
    const filename = imageObj.filename;
    const baseFilename = filename.includes('/') ? filename.split('/').pop() : filename;
    const url = imageUrls[baseFilename || ''];
    if (url) {
      const dt = e.dataTransfer;
      dt.effectAllowed = 'copy';
      dt.setData('text/plain', url);
      dt.setData('drag-filename', filename);
      dt.setData('drag-prompt', imageObj.prompt);

      const img = e.currentTarget as HTMLElement;
      if (img && img instanceof HTMLImageElement) {
        dt.setDragImage(img, img.width / 2, img.height / 2);
      }
    }
  };

  const handleImageLoad = (baseFilename: string) => {
    setLoadedImages((prev) => ({ ...prev, [baseFilename]: true }));
  };

  /**
   * Save the current `editedPrompt` back to the correct image in `originalOrder`.
   * Only do so if the user actually changed it.
   */
  const savePrompt = useCallback(() => {
    console.log('[Gallery savePrompt] Attempting to save prompt.');
    if (selectedImageIndex === null || selectedImageIndex < 0) {
      console.log('[Gallery savePrompt] Aborted: selectedImageIndex is invalid.', selectedImageIndex);
      return;
    }
    if (editedPrompt !== originalPrompt) {
      console.log(`[Gallery savePrompt] Prompt changed from "${originalPrompt}" to "${editedPrompt}". Proceeding with save.`);
      // Find the actual global index of the displayed image
      const actualIndex = (page - 1) * itemsPerPage + selectedImageIndex;
      if (actualIndex >= 0 && actualIndex < displayedImages.length) {
        const displayedImg = displayedImages[actualIndex];
        console.log('[Gallery savePrompt] Found displayed image:', displayedImg);
        // Find same image in originalOrder to update
        const globalIndex = originalOrder.current.findIndex(
          (img) => img.filename === displayedImg.filename
        );
        if (globalIndex >= 0) {
          console.log('[Gallery savePrompt] Found image in originalOrder at index:', globalIndex);
          originalOrder.current[globalIndex] = {
            ...originalOrder.current[globalIndex],
            prompt: editedPrompt,
          };
          // Update store so data is persisted
          console.log('[Gallery savePrompt] Calling updateSettingsInStore.');
          updateSettingsInStore({ files: originalOrder.current });
          // Refresh the displayed images so the updated prompt shows immediately
          refreshDisplayedImages(originalOrder.current);
        } else {
          console.error('[Gallery savePrompt] Error: Could not find image in originalOrder.current:', displayedImg.filename);
        }
      } else {
         console.error('[Gallery savePrompt] Error: actualIndex is out of bounds:', actualIndex);
      }
    } else {
      console.log('[Gallery savePrompt] Prompt did not change. No save needed.');
    }
  }, [
    editedPrompt,
    originalPrompt,
    selectedImageIndex,
    displayedImages,
    page,
    itemsPerPage,
    updateSettingsInStore,
    refreshDisplayedImages
  ]);

  const handleImageDoubleClick = (imageUrl: string, imageObj: ImageObject, indexInDisplayed: number) => {
    setSelectedImage({
      url: imageUrl,
      prompt: imageObj.prompt,
      isVideo: isVideoFile(imageObj.filename)
    });
    setSelectedImageIndex(indexInDisplayed);
  };

  const handleCloseModal = () => {
    // Save prompt changes before closing
    console.log('[Gallery handleCloseModal] Modal closing, calling savePrompt.');
    savePrompt();
    setSelectedImage(null);
    setSelectedImageIndex(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!selectedImage) return;

    // Check if the event target is the prompt input
    const isPromptInputFocused = promptInputRef.current === document.activeElement;
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isCtrlCmd = isMac ? e.metaKey : e.ctrlKey;

    // Handle Escape key regardless of focus
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleCloseModal();
      return;
    }

    // --- Shortcuts that work regardless of input focus ---

    // Star/Unstar (Ctrl/Cmd + S)
    if (isCtrlCmd && e.key.toLowerCase() === 's') {
      e.preventDefault();
      e.stopPropagation();
      const imageObj = displayedImages.find((img) => {
        const baseFilename = img.filename.includes('/') ? img.filename.split('/').pop() : img.filename;
        return imageUrls[baseFilename || ''] === selectedImage.url;
      });
      if (imageObj) {
        handleStarToggle(imageObj.filename);
      }
      return; // Handled
    }

    // Download (Ctrl/Cmd + D)
    if (isCtrlCmd && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      e.stopPropagation();
      const imageObj = displayedImages.find((img) => {
         const baseFilename = img.filename.includes('/') ? img.filename.split('/').pop() : img.filename;
         return imageUrls[baseFilename || ''] === selectedImage.url;
      });
      if (imageObj && selectedImage.url) {
         handleDownload(selectedImage.url, imageObj.filename);
      }
      return; // Handled
    }

    // Delete (Delete key)
    if (e.key === 'Delete' && !isPromptInputFocused) { // Avoid deleting text in input
        e.preventDefault();
        e.stopPropagation();
        const imageObjToDelete = displayedImages.find((img) => {
            const baseFilename = img.filename.includes('/') ? img.filename.split('/').pop() : img.filename;
            return imageUrls[baseFilename || ''] === selectedImage.url;
        });
        if (imageObjToDelete) {
            const indexInCurrentPage = currentPageImages.findIndex(img => img.filename === imageObjToDelete.filename);
            if (indexInCurrentPage !== -1) {
                handleDelete(indexInCurrentPage);
                handleCloseModal();
            }
        }
        return; // Handled
    }

    // --- Shortcuts dependent on input focus ---

    if (isPromptInputFocused) {
      // Discard Changes (Ctrl/Cmd + Z) - Only when input focused & changes exist
      if (isCtrlCmd && e.key.toLowerCase() === 'z' && editedPrompt !== originalPrompt) {
        e.preventDefault();
        e.stopPropagation();
        setEditedPrompt(originalPrompt);
      }
      // Let other keys like Tab, Shift+Tab, regular text input work normally

    } else {
      // Handle Tab/Shift+Tab for navigation ONLY if the prompt input is NOT focused
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const direction = e.shiftKey ? 'prev' : 'next';
        const currentIndex = selectedImageIndex;
        if (direction === 'prev' && currentIndex !== null && currentIndex > 0) {
          savePrompt();
          handleNavigateImage('prev');
        } else if (direction === 'next' && currentIndex !== null && currentIndex < displayedImages.length - 1) {
          savePrompt();
          handleNavigateImage('next');
        }
      }

      // Copy Prompt (Ctrl/Cmd + C) - Only when input NOT focused
      if (isCtrlCmd && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(selectedImage.prompt || '').then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 1500);
        }).catch(err => {
            console.error('[Gallery] => copy to clipboard failed:', err);
        });
      }
    }
  };

  const handleNavigateImage = (direction: 'prev' | 'next') => {
    if (!selectedImage) return;

    const currentIndex = displayedImages.findIndex((img: ImageObject) => {
      const baseFilename = img.filename.includes('/')
        ? img.filename.split('/').pop()
        : img.filename;
      return imageUrls[baseFilename || ''] === selectedImage.url;
    });

    // Save changes before navigating
    savePrompt();

    let newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < displayedImages.length) {
      const imageObj = displayedImages[newIndex];
      if (imageObj && imageObj.filename) {
        const baseFilename = imageObj.filename.split('/').pop();
        setSelectedImage({
          url: imageUrls[baseFilename || ''],
          prompt: imageObj.prompt,
          isVideo: isVideoFile(imageObj.filename)
        });
        setSelectedImageIndex(newIndex);
        const newPage = Math.floor(newIndex / itemsPerPage) + 1;
        if (newPage !== page) {
          setPage(newPage);
          updateSettingsInStore({ page: newPage });
        }
      }
    }
  };

  const handleSizeChange = (event: any, newSize: ImageSize) => {
    if (newSize !== null) {
      setImageSize(newSize);
      updateSettingsInStore({ imageSize: newSize });
    }
  };

  /**
   * MAIN DROP HANDLER
   * - If the drop has 'drag-filename', it's from another Gallery; treat like an OS drop
   * - If the drop has OS files, upload them
   */
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDraggingOver(false);

    const fromFilename = e.dataTransfer.getData('drag-filename');
    if (fromFilename) {
      // Another gallery is dragging a file into this one:
      const newFileObj = {
        filename: fromFilename,
        starred: false,
        prompt: e.dataTransfer.getData('drag-prompt') || ''
      };
      originalOrder.current.push(newFileObj);
      await loadImage(fromFilename);

      // Always sort oldest & jump to last page
      setSortOrder('oldest');
      const sorted = refreshDisplayedImages(originalOrder.current);
      const totalPages = Math.ceil(sorted.length / itemsPerPage);
      setPage(totalPages);
      updateSettingsInStore({ 
        files: originalOrder.current,
        sortOrder: 'oldest',
        page: totalPages
      });
      return;
    }

    let fileItems = Array.from(e.dataTransfer.items || []);
    if (!fileItems.length && e.dataTransfer.files) {
      fileItems = Array.from(e.dataTransfer.files).map((f: File) => ({
        kind: 'file',
        type: f.type,
        getAsFile: () => f
      })) as any[];
    }

    const files = fileItems
      .filter((item: any) => {
        return item.kind === 'file' && 
          (item.type.startsWith?.('image/') || item.type.startsWith?.('video/'));
      })
      .map((item: any) => item.getAsFile());

    if (!files.length) return;

    try {
      const newImages: ImageObject[] = [];
      for (let file of files) {
        if (!file) continue;

        const formData = new FormData();
        const timestamp = Date.now();
        const fileName = `${timestamp}_${file.name}`;
        formData.append('file', file, fileName);

        let savedFileName = '';
        try {
          const response = await fetch(`http://${config.serverAddress}/data/files`, {
            method: 'POST',
            body: formData
          });
          if (!response.ok) {
            const bodyText = await response.text();
            throw new Error(`Failed to upload file: ${response.statusText} => ${bodyText}`);
          }
          savedFileName = await response.text();
        } catch (err) {
          console.error('[Gallery] => handleDrop => file upload error:', err);
          continue;
        }

        if (!savedFileName) {
          continue;
        }
        const newObj: ImageObject = { filename: savedFileName, starred: false, prompt: '' };
        newImages.push(newObj);
      }

      if (newImages.length) {
        originalOrder.current.push(...newImages);

        await Promise.all(
          newImages.map(async (image) => {
            const baseFileName = image.filename.split('/').pop() || image.filename;
            if (!imageUrls[baseFileName]) {
              await loadImage(image.filename);
            }
          })
        );

        // Force sort to oldest & jump to last page so new items appear at the bottom
        setSortOrder('oldest');
        const sorted = refreshDisplayedImages(originalOrder.current);
        const totalPages = Math.ceil(sorted.length / itemsPerPage);
        setPage(totalPages);
        updateSettingsInStore({
          files: originalOrder.current,
          sortOrder: 'oldest',
          page: totalPages
        });
      }
    } catch (error) {
      console.error('[Gallery] => handleDrop => Error handling dropped files:', error);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDraggingOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDraggingOver(false);
    }
  };

  useEffect(() => {
    const cleanup = () => {
      setIsDraggingOver(false);
      dragCounter.current = 0;
    };
    window.addEventListener('dragend', cleanup);
    return () => {
      window.removeEventListener('dragend', cleanup);
    };
  }, []);

  const handleStarToggle = async (filename: string) => {
    const imageIndex = originalOrder.current.findIndex((img) => img.filename === filename);
    if (imageIndex === -1) return;

    // Capture the current index of the selected image from displayedImages
    const currentIndex = displayedImages.findIndex((img: ImageObject) => {
      const baseFilename = img.filename.includes('/') ? img.filename.split('/').pop() : img.filename;
      return imageUrls[baseFilename || ''] === selectedImage?.url;
    });

    const updatedImage = {
      ...originalOrder.current[imageIndex],
      starred: !originalOrder.current[imageIndex].starred
    };
    originalOrder.current[imageIndex] = updatedImage;

    const newStarredImages = new Set(
      originalOrder.current.filter((img) => img.starred).map((img) => img.filename)
    );
    setStarredImages(newStarredImages);

    // Refresh displayed images
    const newDisplayed = refreshDisplayedImages(originalOrder.current);

    updateSettingsInStore({
      files: originalOrder.current
    });

    // If in 'Starred Only' view and the toggled image was the one currently selected (and now unstarred), update selection
    const toggledBaseFilename = filename.includes('/') ? filename.split('/').pop() : filename;
    const toggledImageUrl = imageUrls[toggledBaseFilename || ''];
    if (showStarredOnly && !updatedImage.starred && selectedImage && selectedImage.url === toggledImageUrl) {
      let newIndex = currentIndex;
      if (newIndex < 0 || newIndex >= newDisplayed.length) {
        newIndex = 0;
      } else {
        const candidate = newDisplayed[newIndex];
        const candidateBase = candidate.filename.includes('/') ? candidate.filename.split('/').pop() : candidate.filename;
        if (imageUrls[candidateBase || ''] === toggledImageUrl) {
          if (newIndex + 1 < newDisplayed.length) {
            newIndex++;
          } else if (newIndex - 1 >= 0) {
            newIndex--;
          }
        }
      }
      if (newDisplayed.length > 0 && newIndex >= 0 && newIndex < newDisplayed.length) {
        const newImage = newDisplayed[newIndex];
        const newBase = newImage.filename.includes('/') ? newImage.filename.split('/').pop() : newImage.filename;
        setSelectedImage({
          url: imageUrls[newBase || ''],
          prompt: newImage.prompt,
          isVideo: isVideoFile(newImage.filename)
        });
        setSelectedImageIndex(newIndex);
      } else {
        setSelectedImage(null);
        setSelectedImageIndex(null);
      }
    }
  };

  const handleDeleteNonStarred = async () => {
    setIsDeletingNonStarred(true);
    try {
      const nonStarredImages = originalOrder.current.filter((img) => !img.starred);

      for (const imageObj of nonStarredImages) {
        const filename = imageObj.filename;
        const baseFilename = filename.includes('/') ? filename.split('/').pop() : filename;

        setImageUrls((prev) => {
          const newUrls = { ...prev };
          if (baseFilename) delete newUrls[baseFilename];
          return newUrls;
        });

        try {
          await dataService.deleteNodeFile(galleryData.nodeId || '', baseFilename || '');
        } catch (err) {
          console.error('[Gallery] handleDeleteNonStarred => error deleting file from server:', err);
        }
      }

      originalOrder.current = originalOrder.current.filter((img) => img.starred);
      refreshDisplayedImages(originalOrder.current);

      updateSettingsInStore({ files: originalOrder.current });
    } finally {
      setIsDeletingNonStarred(false);
      setDeleteNonStarredDialogOpen(false);
    }
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('[Gallery] handleDownload => Error downloading file:', error);
    }
  };

  return (
    <Box
      key={fieldKey}
      data-key={fieldKey}
      sx={{ ...style }}
      className={`nodrag ${disabled ? 'mellon-disabled' : ''} ${
        hidden ? 'mellon-hidden' : ''
      }`}
    >
      <Box
        sx={{
          p: 2,
          position: 'relative',
          minHeight: '200px',
          border: isDraggingOver ? '2px dashed #FFA500' : '2px dashed transparent',
          borderRadius: 2,
          transition: 'border-color 0.2s ease-in-out'
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Modal
          open={selectedImage !== null}
          onClose={handleCloseModal}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 2
          }}
        >
          <Box
            onKeyDown={handleKeyDown}
            tabIndex={0}
            sx={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              outline: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            <Box 
              sx={{ 
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: 'fit-content'
              }}
            >
              <IconButton
                onClick={handleCloseModal}
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  color: 'white',
                  bgcolor: 'rgba(0, 0, 0, 0.5)',
                  zIndex: 1,
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    bgcolor: 'rgba(0, 0, 0, 0.7)',
                    transform: 'scale(1.1)'
                  }
                }}
              >
                <CloseIcon />
              </IconButton>
              <Box sx={{ position: 'relative', width: 'fit-content' }}>
                {selectedImage?.isVideo ? (
                    <video
                      ref={mediaRef as React.RefObject<HTMLVideoElement>}
                      src={selectedImage.url}
                      controls
                      autoPlay
                      loop
                      style={{
                        maxWidth: '100%',
                        maxHeight: '90vh',
                        objectFit: 'contain',
                        borderRadius: '8px 8px 0 0',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                      }}
                    />
                ) : (
                  <img
                    ref={mediaRef as React.RefObject<HTMLImageElement>}
                    src={selectedImage?.url}
                    alt="Selected"
                    onLoad={updateMediaWidth}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '90vh',
                      objectFit: 'contain',
                      borderRadius: '8px 8px 0 0',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                      display: 'block'
                    }}
                  />
                )}

                <Box
                  sx={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    display: 'flex',
                    gap: 1,
                    zIndex: 1
                  }}
                >
                  <Tooltip title={displayedImages.find(img => {
                        const baseFilename = img.filename.includes('/') ? img.filename.split('/').pop() : img.filename;
                        return imageUrls[baseFilename || ''] === selectedImage?.url;
                      })?.starred ? "Unstar (Ctrl+S)" : "Star (Ctrl+S)"}>
                    <IconButton
                      onClick={() => {
                        const imageObj = displayedImages.find((img) => {
                          const baseFilename = img.filename.includes('/')
                            ? img.filename.split('/').pop()
                            : img.filename;
                          return imageUrls[baseFilename || ''] === selectedImage?.url;
                        });
                        if (imageObj) {
                          handleStarToggle(imageObj.filename);
                        }
                      }}
                      sx={{
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        color: 'white',
                        width: 32,
                        height: 32,
                        padding: '4px'
                      }}
                    >
                      {displayedImages.find((img) => {
                        const baseFilename = img.filename.includes('/')
                          ? img.filename.split('/').pop()
                          : img.filename;
                        return imageUrls[baseFilename || ''] === selectedImage?.url;
                      })?.starred ? (
                        <StarIcon sx={{ color: 'primary.main' }} />
                      ) : (
                        <StarBorderIcon />
                      )}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Download (Ctrl+D)">
                    <IconButton
                      onClick={() => {
                        const imageObj = displayedImages.find((img) => {
                          const baseFilename = img.filename.includes('/')
                            ? img.filename.split('/').pop()
                            : img.filename;
                          return imageUrls[baseFilename || ''] === selectedImage?.url;
                        });
                        if (imageObj && selectedImage?.url) {
                          handleDownload(selectedImage.url, imageObj.filename);
                        }
                      }}
                      sx={{
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        color: 'white',
                        width: 32,
                        height: 32,
                        padding: '4px'
                      }}
                    >
                      <DownloadIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete (Del)">
                    <IconButton
                      onClick={() => {
                        const imageObjToDelete = displayedImages.find((img) => {
                          const baseFilename = img.filename.includes('/') ? img.filename.split('/').pop() : img.filename;
                          return imageUrls[baseFilename || ''] === selectedImage?.url;
                        });
                        if (imageObjToDelete) {
                           // Find the index in the *original* order to delete properly
                           const indexInOriginal = originalOrder.current.findIndex(img => img.filename === imageObjToDelete.filename);
                           if (indexInOriginal !== -1) {
                             // We need the index relative to the *current page* for the existing handleDelete
                             // OR modify handleDelete to accept filename directly.
                             // Let's find index in the current page for now:
                             const indexInCurrentPage = currentPageImages.findIndex(img => img.filename === imageObjToDelete.filename);
                             if (indexInCurrentPage !== -1) {
                               handleDelete(indexInCurrentPage); // Use the index within the current page
                               handleCloseModal(); // Close modal after delete
                             }
                           }
                        }
                      }}
                      sx={{
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        color: 'white',
                        width: 32,
                        height: 32,
                        padding: '4px'
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>

              {/* Editable Prompt Section */}
              <Box
                sx={{
                  backgroundColor: 'black',
                  color: 'white',
                  padding: '12px',
                  borderRadius: '0 0 8px 8px',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 2,
                  width: mediaWidth ? `${mediaWidth}px` : 'auto',
                  boxSizing: 'border-box'
                }}
              >
                {/* Copy/Discard controls */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Tooltip title="Copy Prompt (Ctrl+C)">
                    <IconButton
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(editedPrompt);
                          setCopySuccess(true);
                          setTimeout(() => setCopySuccess(false), 1500);
                        } catch (err) {
                          console.error('[Gallery] => copy to clipboard failed:', err);
                        }
                      }}
                      sx={{
                        color: copySuccess ? '#4caf50' : 'white',
                        padding: '4px',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.1)'
                        }
                      }}
                      size="small"
                      disabled={copySuccess}
                    >
                      {copySuccess ? (
                        <CheckIcon sx={{ fontSize: 16 }} />
                      ) : (
                        <ContentCopyIcon sx={{ fontSize: 16 }} />
                      )}
                    </IconButton>
                  </Tooltip>
                  {editedPrompt !== originalPrompt && (
                    <Tooltip title="Discard Changes (Ctrl+Z)">
                      <IconButton
                        onClick={() => setEditedPrompt(originalPrompt)}
                        sx={{
                          color: 'white',
                          padding: '4px',
                          '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.1)'
                          }
                        }}
                        size="small"
                      >
                        <CloseIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>

                {/* The text field for editing */}
                <TextField
                  inputRef={promptInputRef}
                  variant="outlined"
                  size="small"
                  multiline
                  fullWidth
                  autoFocus
                  minRows={1}
                  maxRows={5}
                  value={editedPrompt}
                  onChange={(e) => setEditedPrompt(e.target.value)}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      color: 'white',
                      fontFamily: 'monospace',
                      fontSize: '14px',
                      lineHeight: 1.4
                    },
                    '& .MuiInputBase-input': {
                      padding: '8px'
                    },
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(255, 255, 255, 0.2)'
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(255, 255, 255, 0.4)'
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#ffffff'
                    },
                    flex: 1
                  }}
                />
              </Box>
            </Box>

            <Tooltip title="Previous (Shift+Tab)">
              <span style={{
                position: 'absolute',
                left: -56,
                top: '50%',
                transform: 'translateY(-50%)',
                display: (selectedImageIndex === null || selectedImageIndex <= 0) ? 'none' : 'inline-block' 
              }}> 
                <IconButton
                  onClick={() => handleNavigateImage('prev')}
                  sx={{
                    color: 'white',
                    bgcolor: 'rgba(0, 0, 0, 0.5)',
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      bgcolor: 'rgba(0, 0, 0, 0.7)',
                      transform: 'scale(1.1)'
                    }
                  }}
                  disabled={selectedImageIndex === null || selectedImageIndex <= 0}
                  aria-label="Previous Image"
                >
                  <ChevronLeftIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Next (Tab)">
              <span style={{
                  position: 'absolute',
                  right: -56,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: (selectedImageIndex === null || selectedImageIndex >= displayedImages.length - 1) ? 'none' : 'inline-block'
                }}> 
                <IconButton
                  onClick={() => handleNavigateImage('next')}
                  sx={{
                    color: 'white',
                    bgcolor: 'rgba(0, 0, 0, 0.5)',
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      bgcolor: 'rgba(0, 0, 0, 0.7)',
                      transform: 'scale(1.1)'
                    }
                  }}
                  disabled={selectedImageIndex === null || selectedImageIndex >= displayedImages.length - 1}
                  aria-label="Next Image"
                >
                  <ChevronRightIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Modal>

        <Box
          sx={{
            mb: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 2
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <FormControl size="small" sx={{ width: 80 }}>
                <InputLabel id="items-per-page-label">Items/page</InputLabel>
                <Select
                  labelId="items-per-page-label"
                  value={itemsPerPage}
                  label="Items/page"
                  onChange={(e) => {
                    const newValue = parseInt(e.target.value as string, 10);
                    setItemsPerPage(newValue);
                    const newTotalPages = Math.ceil(displayedImages.length / newValue);
                    setPage(newTotalPages);
                    updateSettingsInStore({ itemsPerPage: newValue, page: newTotalPages });
                  }}
                  sx={{ color: 'text.primary' }}
                >
                  {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ width: 80 }}>
                <InputLabel id="columns-label">Columns</InputLabel>
                <Select
                  labelId="columns-label"
                  value={numColumns}
                  label="Columns"
                  onChange={(e) => {
                    const newValue = parseInt(e.target.value as string, 10);
                    setNumColumns(newValue);
                    updateSettingsInStore({ numColumns: newValue });
                  }}
                  sx={{ color: 'text.primary' }}
                >
                  {COLUMNS_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            <Pagination
              count={totalPages}
              page={page}
              onChange={handlePageChange}
              size="small"
              sx={{
                '& .MuiPaginationItem-root': {
                  color: 'text.primary'
                }
              }}
            />
            <TextField
              variant="outlined"
              size="small"
              placeholder="Search images..."
              value={searchTerm}
              onChange={(e) => {
                const newValue = e.target.value;
                setSearchTerm(newValue);
                updateSettingsInStore({ searchTerm: newValue });
                refreshDisplayedImages(originalOrder.current);
              }}
              sx={{ mt: 1 }}
            />
          </Box>

          {/* Sort Toggling: now the text reflects the *current* mode */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <Button
              onClick={() =>
                handleSortChange(null, sortOrder === 'newest' ? 'oldest' : 'newest')
              }
              size="small"
              startIcon={
                <SortIcon
                  sx={{ transform: sortOrder === 'newest' ? 'none' : 'scaleY(-1)' }}
                />
              }
              sx={{
                color: 'text.primary',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.08)'
                }
              }}
            >
              {sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}
            </Button>
            <Button
              onClick={() => {
                const newShowStarredOnly = !showStarredOnly;
                setShowStarredOnly(newShowStarredOnly);

                const newFiltered = newShowStarredOnly
                  ? originalOrder.current.filter((img) => img.starred)
                  : [...originalOrder.current];
                const newTotalPages = Math.ceil(newFiltered.length / itemsPerPage);
                const nextPage = page > newTotalPages ? 1 : page;
                setPage(nextPage);

                refreshDisplayedImages(originalOrder.current);
                updateSettingsInStore({
                  showStarredOnly: newShowStarredOnly,
                  page: nextPage
                });
              }}
              size="small"
              startIcon={showStarredOnly ? <StarIcon /> : <StarBorderIcon />}
              sx={{
                color: showStarredOnly ? 'primary.main' : 'text.primary',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.08)'
                }
              }}
            >
              {showStarredOnly ? 'Starred Only' : 'Showing All'}
            </Button>
          </Box>
        </Box>

        <Box sx={{ position: 'relative', mb: 2 }}>
          <ImageList
            cols={numColumns}
            gap={8}
            sx={{
              overflow: 'visible',
              mb: 1,
              '& .MuiImageListItem-root': {
                width: IMAGE_SIZES[imageSize],
                height: IMAGE_SIZES[imageSize],
                padding: 0,
                mb: 0.5,
                '& > div': {
                  margin: 0
                }
              }
            }}
          >
            {currentPageImages
              .map((imageObj, index) => {
                if (!imageObj || !imageObj.filename) {
                  return null;
                }

                const filename = imageObj.filename;
                const baseFilename = filename.includes('/')
                  ? filename.split('/').pop()
                  : filename;
                const isStarred = imageObj.starred;

                return (
                  <ImageListItem
                    key={`${filename}_${index}`}
                    sx={{
                      position: 'relative',
                      transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      '&:hover': {
                        transform: 'scale(1.05)',
                        zIndex: 1,
                        '& img': {
                          boxShadow: '0 8px 16px rgba(0,0,0,0.2)'
                        },
                        '& .image-action-button': {
                          opacity: 1,
                          transform: 'scale(1)'
                        }
                      }
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                  >
                    {imageUrls[baseFilename || ''] && (
                      <Box
                        sx={{
                          position: 'relative',
                          width: IMAGE_SIZES[imageSize],
                          height: IMAGE_SIZES[imageSize]
                        }}
                      >
                        {!loadedImages[baseFilename || ''] && (
                          <Skeleton
                            variant="rounded"
                            width={IMAGE_SIZES[imageSize]}
                            height={IMAGE_SIZES[imageSize]}
                            animation="wave"
                            sx={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              bgcolor: 'rgba(255, 255, 255, 0.1)',
                              borderRadius: '4px'
                            }}
                          />
                        )}
                        <Fade in={loadedImages[baseFilename || '']} timeout={500}>
                          <div>
                            {isVideoFile(filename) ? (
                              <div
                                onClick={() =>
                                  handleImageDoubleClick(
                                    imageUrls[baseFilename || ''],
                                    imageObj,
                                    index
                                  )
                                }
                                style={{
                                  width: IMAGE_SIZES[imageSize],
                                  height: IMAGE_SIZES[imageSize],
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  position: 'relative',
                                  overflow: 'visible'
                                }}
                              >
                                <video
                                  src={imageUrls[baseFilename || '']}
                                  onMouseEnter={(ev) => {
                                    if (!isDraggingMedia) {
                                      ev.currentTarget.play();
                                    }
                                  }}
                                  onMouseLeave={(ev) => ev.currentTarget.pause()}
                                  onDragEnd={() => setIsDraggingMedia(false)}
                                  onLoadedData={() =>
                                    handleImageLoad(baseFilename || '')
                                  }
                                  onDragStart={(ev) => handleDragStart(ev, index)}
                                  onError={() => handleDelete(index)}
                                  draggable
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    borderRadius: '4px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    opacity: loadedImages[baseFilename || ''] ? 1 : 0
                                  }}
                                />
                              </div>
                            ) : (
                              <div
                                style={{
                                  width: IMAGE_SIZES[imageSize],
                                  height: IMAGE_SIZES[imageSize],
                                  position: 'relative',
                                  overflow: 'visible'
                                }}
                              >
                                <img
                                  src={imageUrls[baseFilename || '']}
                                  alt={`Generated image ${index + 1}`}
                                  loading="lazy"
                                  draggable="true"
                                  onLoad={() => handleImageLoad(baseFilename || '')}
                                  onDragStart={(ev) => handleDragStart(ev, index)}
                                  onError={() => handleDelete(index)}
                                  onClick={() =>
                                    handleImageDoubleClick(
                                      imageUrls[baseFilename || ''],
                                      imageObj,
                                      index
                                    )
                                  }
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    opacity: loadedImages[baseFilename || ''] ? 1 : 0,
                                    position: 'absolute',
                                    top: 0,
                                    left: 0
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </Fade>
                        <IconButton
                          className="image-action-button"
                          onClick={() => handleStarToggle(filename)}
                          sx={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                            color: isStarred ? 'primary.main' : 'white',
                            width: 24,
                            padding: '4px',
                            opacity: isStarred ? 1 : 0,
                            transform: isStarred ? 'scale(1)' : 'scale(0.8)',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                          }}
                        >
                          {isStarred ? (
                            <StarIcon sx={{ fontSize: 16 }} />
                          ) : (
                            <StarBorderIcon />
                          )}
                        </IconButton>
                        <IconButton
                          className="image-action-button"
                          onClick={() => handleDownload(imageUrls[baseFilename || ''], filename)}
                          sx={{
                            position: 'absolute',
                            bottom: 0,
                            right: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                            color: 'white',
                            width: 24,
                            padding: '4px',
                            opacity: 0,
                            transform: 'scale(0.8)',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                          }}
                        >
                          <Tooltip title="Download (Ctrl+D)">
                            <DownloadIcon sx={{ fontSize: 16 }} />
                          </Tooltip>
                        </IconButton>
                        <IconButton
                          className="image-action-button"
                          onClick={() => handleDelete(index)}
                          disabled={isDeletingImage === index}
                          sx={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                            color: 'white',
                            width: 24,
                            padding: '4px',
                            opacity: 0,
                            transform: 'scale(0.8)',
                            visibility: isDeletingImage === index ? 'hidden' : 'visible'
                          }}
                        >
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                        {imageObj.prompt && (
                          <Tooltip
                            title={
                              <Box sx={{ textAlign: 'center', maxWidth: 280, p: 1 }}>
                                <Box sx={{ mb: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                  {imageObj.prompt}
                                </Box>
                                <Tooltip title={thumbnailCopySuccess[filename] ? "Copied!" : "Copy Prompt"}>
                                  <span>
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(imageObj.prompt).then(() => {
                                          console.log('Prompt copied!');
                                          setThumbnailCopySuccess(prev => ({ ...prev, [filename]: true }));
                                          setTimeout(() => {
                                            setThumbnailCopySuccess(prev => ({ ...prev, [filename]: false }));
                                          }, 1500);
                                        }).catch(err => {
                                          console.error('Failed to copy prompt:', err);
                                        });
                                      }}
                                      sx={{
                                        color: thumbnailCopySuccess[filename] ? '#4caf50' : 'white',
                                        border: '1px solid rgba(255, 255, 255, 0.5)',
                                        padding: '4px',
                                        backgroundColor: 'rgba(0,0,0,0.2)',
                                        '&:hover': {
                                          borderColor: 'white',
                                          bgcolor: 'rgba(255, 255, 255, 0.1)',
                                        },
                                      }}
                                      disabled={thumbnailCopySuccess[filename]}
                                    >
                                      {thumbnailCopySuccess[filename] ? (
                                        <CheckIcon sx={{ fontSize: 16 }} />
                                      ) : (
                                        <ContentCopyIcon sx={{ fontSize: 16 }} />
                                      )}
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              </Box>
                            }
                            placement="top"
                            arrow
                            componentsProps={{
                              tooltip: {
                                sx: {
                                  textAlign: 'center',
                                  '& .MuiTooltip-arrow': {
                                    color: 'rgba(0, 0, 0, 0.9)'
                                  }
                                }
                              }
                            }}
                            sx={{
                              maxWidth: 300,
                              fontSize: '14px',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              bgcolor: 'rgba(0, 0, 0, 0.9)'
                            }}
                          >
                            <IconButton
                              className="image-action-button"
                              sx={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                color: 'white',
                                width: 24,
                                padding: '4px',
                                opacity: 0,
                                transform: 'scale(0.8)',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                              }}
                            >
                              <InfoIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    )}
                  </ImageListItem>
                );
              })
              .filter(Boolean)}
          </ImageList>

          {/* Bottom-right toggle for image size */}
          <Box
            sx={{
              position: 'absolute',
              bottom: -48,
              right: 0,
              zIndex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              borderRadius: 1,
              padding: '4px',
              backdropFilter: 'blur(4px)'
            }}
          >
            <ToggleButtonGroup
              value={imageSize}
              exclusive
              onChange={handleSizeChange}
              size="small"
              sx={{
                '& .MuiToggleButton-root': {
                  color: 'text.primary',
                  '&.Mui-selected': {
                    color: 'primary.main',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)'
                  }
                }
              }}
            >
              <ToggleButton value="small">S</ToggleButton>
              <ToggleButton value="medium">M</ToggleButton>
              <ToggleButton value="large">L</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>

        {/* Delete all non-starred */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-start',
            mt: 2,
            position: 'relative',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: '-8px',
              left: 0,
              right: '75%',
              height: '1px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            }
          }}
        >
          <Button
            onClick={() => setDeleteNonStarredDialogOpen(true)}
            startIcon={<DeleteSweepIcon />}
            color="error"
            disabled={isDeletingNonStarred || !originalOrder.current.some((img) => !img.starred)}
            sx={{
              '&.Mui-disabled': {
                color: 'rgba(255, 255, 255, 0.3)'
              }
            }}
          >
            Delete All Non-Starred
          </Button>
        </Box>
        <Dialog
          open={deleteNonStarredDialogOpen}
          onClose={() => !isDeletingNonStarred && setDeleteNonStarredDialogOpen(false)}
        >
          <DialogTitle>Delete All Non-Starred Images?</DialogTitle>
          <DialogContent>
            This will permanently delete all images that are not starred. This action cannot
            be undone.
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setDeleteNonStarredDialogOpen(false)}
              disabled={isDeletingNonStarred}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteNonStarred}
              color="error"
              disabled={isDeletingNonStarred}
              startIcon={isDeletingNonStarred ? <CircularProgress size={16} /> : <DeleteSweepIcon />}
            >
              {isDeletingNonStarred ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

export default Gallery;
