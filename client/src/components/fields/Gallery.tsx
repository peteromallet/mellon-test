import React, { useEffect, useRef } from 'react';
import { Box, ImageList, ImageListItem, IconButton, Select, MenuItem, FormControl, InputLabel, Button, Pagination, Skeleton, Fade, Modal, ToggleButtonGroup, ToggleButton, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress } from '@mui/material';
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

import { useNodeState } from '../../stores/nodeStore';
import dataService from '../../services/dataService';
import config from '../../../config';
import { FieldProps } from '../NodeContent'; // Standard Mellon FieldProps import

// Just for clarity, these types are the same:
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
  };
  files?: string[]; // Fallback if no params?.files
}

interface SelectedImage {
  url: string;
  prompt: string;
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
  // First, log what we are receiving in `value`.
  console.log('[Gallery] Rendering. Props fieldKey=', fieldKey);
  console.log('[Gallery] The `value` prop is:', value);

  // Parse the incoming value into a typed structure
  const galleryData: GalleryData = (value && typeof value === 'object' ? ((value as any).value || value) : {}) as GalleryData;
  console.log('[Gallery] Computed galleryData =', galleryData);

  const imageRefs = useRef<Record<string, HTMLImageElement>>({});
  const originalOrder = useRef<ImageObject[]>([]);
  const lastGeneratedImage = useRef<string | null>(null);

  const setParamValue = useNodeState((state: any) => state.setParamValue);
  const [isDeletingImage, setIsDeletingImage] = React.useState<number | null>(null);
  const [imageUrls, setImageUrls] = React.useState<Record<string, string>>({});
  const [displayedImages, setDisplayedImages] = React.useState<ImageObject[]>([]);
  const [sortOrder, setSortOrder] = React.useState<'newest' | 'oldest' | 'custom'>('newest');
  const [itemsPerPage, setItemsPerPage] = React.useState(16);
  const [numColumns, setNumColumns] = React.useState(4);
  const [page, setPage] = React.useState(1);
  const [loadedImages, setLoadedImages] = React.useState<Record<string, boolean>>({});
  const [selectedImage, setSelectedImage] = React.useState<SelectedImage | null>(null);

  const [imageSize, setImageSize] = React.useState<ImageSize>((galleryData?.params?.imageSize as ImageSize) || 'small');
  const [isDraggingOver, setIsDraggingOver] = React.useState(false);
  const [starredImages, setStarredImages] = React.useState<Set<string>>(new Set());
  const [showStarredOnly, setShowStarredOnly] = React.useState(false);
  const [copySuccess, setCopySuccess] = React.useState(false);
  const [deleteNonStarredDialogOpen, setDeleteNonStarredDialogOpen] = React.useState(false);
  const [isDeletingNonStarred, setIsDeletingNonStarred] = React.useState(false);

  // Debug when `galleryData` changes
  useEffect(() => {
    console.log('[Gallery] useEffect: `galleryData` changed:', galleryData);
  }, [galleryData]);

  // Track successful generations (if that's relevant)
  useEffect(() => {
    if (galleryData?.params?.output?.success && galleryData?.params?.output?.filename) {
      lastGeneratedImage.current = galleryData.params.output.filename;
      console.log('[Gallery] useEffect: Detected a newly generated image =>', lastGeneratedImage.current);
    }
  }, [galleryData]);

  // Main effect to parse galleryData and set displayedImages
  useEffect(() => {
    console.log('[Gallery] useEffect: reading files from galleryData.params.files or galleryData.files');

    // The array of images stored in either params.files or fallback to galleryData.files
    const savedImages: ImageObject[] = Array.isArray(galleryData?.params?.files)
      ? galleryData.params.files
      : Array.isArray(galleryData?.files)
        ? galleryData.files.map((filename: string) => ({
            filename,
            starred: false,
            prompt: ''
          }))
        : [];

    console.log('[Gallery] => savedImages length:', savedImages.length);

    // Update originalOrder in a ref
    originalOrder.current = savedImages;

    // Start loading images (calls loadImage for any not in state)
    savedImages.forEach((imageObj: ImageObject) => {
      const baseFileName = imageObj.filename.includes('/')
        ? imageObj.filename.split('/').pop()
        : imageObj.filename;

      if (baseFileName && !imageUrls[baseFileName]) {
        loadImage(imageObj.filename);
      }
    });

    // Filter if showStarredOnly is turned on
    let filteredImages = showStarredOnly
      ? savedImages.filter((img: ImageObject) => img.starred)
      : savedImages;

    // Then sort
    const sortedImages = (sortOrder === 'newest')
      ? [...filteredImages].reverse()
      : [...filteredImages];

    setDisplayedImages(sortedImages);
  }, [
    galleryData?.files,
    galleryData?.params?.files,
    imageUrls,
    showStarredOnly,
    sortOrder,
  ]);

  // Optional: an effect to track changes to displayedImages
  useEffect(() => {
    console.log('[Gallery] useEffect: displayedImages changed:', displayedImages);
  }, [displayedImages]);

  // Optional: separate effect for imageUrls updates
  useEffect(() => {
    console.log('[Gallery] useEffect: imageUrls changed: total keys=', Object.keys(imageUrls).length, imageUrls);
  }, [imageUrls]);

  // If the node allows specifying a default image size in params, capture that
  useEffect(() => {
    if (
      galleryData?.params?.imageSize &&
      (galleryData.params.imageSize === 'small' ||
       galleryData.params.imageSize === 'medium' ||
       galleryData.params.imageSize === 'large')
    ) {
      console.log('[Gallery] useEffect: Setting imageSize from galleryData:', galleryData.params.imageSize);
      setImageSize(galleryData.params.imageSize as ImageSize);
    }
  }, [galleryData?.params?.imageSize]);

  const handleSortChange = (event: any, newSortOrder: 'newest' | 'oldest' | 'custom') => {
    if (newSortOrder !== null) {
      console.log('[Gallery] handleSortChange => newSortOrder:', newSortOrder);
      setSortOrder(newSortOrder);

      let filteredImages = showStarredOnly
        ? originalOrder.current.filter((img: ImageObject) => img.starred)
        : [...originalOrder.current];

      const sortedImages = (newSortOrder === 'newest')
        ? [...filteredImages].reverse()
        : [...filteredImages];

      setDisplayedImages(sortedImages);
    }
  };

  const handlePageChange = (event: any, value: number) => {
    console.log('[Gallery] handlePageChange => page:', value);
    setPage(value);
  };

  const totalPages = Math.ceil(displayedImages.length / itemsPerPage);
  const currentPageImages = displayedImages.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  // Attempt to load an image from /data/files
  const loadImage = async (imageName: string): Promise<string | null> => {
    try {
      console.log('[Gallery] loadImage called for:', imageName);
      const baseFileName = imageName.includes('/')
        ? imageName.split('/').pop()
        : imageName;
      if (!baseFileName) {
        console.warn('[Gallery] loadImage => baseFileName is empty, skipping');
        return null;
      }

      const imageUrl = `http://${config.serverAddress}/data/files/${baseFileName}`;
      console.log('[Gallery] => generated imageUrl:', imageUrl);

      // Immediately store this in state to force a re-render
      setImageUrls((prev) => {
        if (prev[baseFileName]) {
          console.log('[Gallery] => imageUrl already in state, skipping');
          return prev;
        }
        console.log('[Gallery] => adding new imageUrl to state for', baseFileName);
        return { ...prev, [baseFileName]: imageUrl };
      });

      return imageUrl;
    } catch (error) {
      console.error('[Gallery] Error in loadImage:', error);
      return null;
    }
  };

  const handleDelete = async (index: number): Promise<void> => {
    // Because of pagination, compute the index in displayedImages
    const actualIndex = (page - 1) * itemsPerPage + index;
    console.log('[Gallery] handleDelete => Attempting to delete index:', actualIndex);
    if (isDeletingImage === actualIndex) return;
    setIsDeletingImage(actualIndex);

    try {
      const imageObj = displayedImages[actualIndex];
      if (!imageObj) {
        console.warn('[Gallery] handleDelete => No image object at that index');
        return;
      }
      const filename = imageObj.filename;
      const baseFilename = filename.includes('/') ? filename.split('/').pop() : filename;

      if (baseFilename) {
        // Remove from local state
        setImageUrls((prev) => {
          const newUrls = { ...prev };
          delete newUrls[baseFilename];
          return newUrls;
        });

        // Actually remove from the server
        try {
          await dataService.deleteNodeFile(galleryData.nodeId || '', baseFilename);
        } catch (err) {
          console.error('[Gallery] handleDelete => Error deleting file from server:', err);
        }

        // Filter out the deleted file from originalOrder
        originalOrder.current = originalOrder.current.filter((img) => img.filename !== filename);

        // Re-filter and sort the displayed images
        let newDisplayedImages = showStarredOnly
          ? originalOrder.current.filter((img: ImageObject) => img.starred)
          : [...originalOrder.current];

        newDisplayedImages = (sortOrder === 'newest')
          ? [...newDisplayedImages].reverse()
          : [...newDisplayedImages];

        setDisplayedImages(newDisplayedImages);

        // Let the store know that the param changed
        const newValue = {
          params: {
            component: 'ui_gallery',
            files: originalOrder.current
          }
        };
        updateStore?.(fieldKey, newValue);
        console.log('[Gallery] handleDelete => updated store after deletion');
      }
    } finally {
      setIsDeletingImage(null);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    console.log('[Gallery] handleDragStart => index:', index);
    // Because of pagination, compute the index in displayedImages
    const actualIndex = (page - 1) * itemsPerPage + index;
    const imageObj = displayedImages[actualIndex];
    if (!imageObj || !imageObj.filename) {
      console.warn('[Gallery] handleDragStart => invalid imageObj:', imageObj);
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
      const img = e.currentTarget as HTMLImageElement;
      dt.setDragImage(img, img.width / 2, img.height / 2);
    }
  };

  const handleImageLoad = (baseFilename: string) => {
    console.log('[Gallery] handleImageLoad => loaded:', baseFilename);
    setLoadedImages((prev) => ({ ...prev, [baseFilename]: true }));
  };

  const handleImageDoubleClick = (imageUrl: string, imageObj: ImageObject) => {
    console.log('[Gallery] handleImageDoubleClick => opening modal for:', imageUrl);
    setSelectedImage({ url: imageUrl, prompt: imageObj.prompt });
  };

  const handleCloseModal = () => {
    console.log('[Gallery] handleCloseModal => closing image modal');
    setSelectedImage(null);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!selectedImage) return;
    e.stopPropagation();
    const currentIndex = displayedImages.findIndex((img: ImageObject) => {
      const baseFilename = img.filename.includes('/')
        ? img.filename.split('/').pop()
        : img.filename;
      return imageUrls[baseFilename || ''] === selectedImage.url;
    });

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (currentIndex > 0) {
        const prevImage = displayedImages[currentIndex - 1];
        if (prevImage && prevImage.filename) {
          const baseFilename = prevImage.filename.split('/').pop();
          setSelectedImage({ url: imageUrls[baseFilename || ''], prompt: prevImage.prompt });
        }
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (currentIndex < displayedImages.length - 1) {
        const nextImage = displayedImages[currentIndex + 1];
        if (nextImage && nextImage.filename) {
          const baseFilename = nextImage.filename.split('/').pop();
          setSelectedImage({ url: imageUrls[baseFilename || ''], prompt: nextImage.prompt });
        }
      }
    } else if (e.key === 'Escape') {
      handleCloseModal();
    }
  };

  // Attach keyDown globally only if the modal is open
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedImage, displayedImages, imageUrls]);

  const handleNavigateImage = (direction: 'prev' | 'next') => {
    if (!selectedImage) return;
    const currentIndex = displayedImages.findIndex((img: ImageObject) => {
      const baseFilename = img.filename.includes('/') ? img.filename.split('/').pop() : img.filename;
      return imageUrls[baseFilename || ''] === selectedImage.url;
    });

    let newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < displayedImages.length) {
      const imageObj = displayedImages[newIndex];
      if (imageObj && imageObj.filename) {
        const baseFilename = imageObj.filename.split('/').pop();
        setSelectedImage({ url: imageUrls[baseFilename || ''], prompt: imageObj.prompt });
      }
    }
  };

  const handleSizeChange = (event: any, newSize: ImageSize) => {
    if (newSize !== null) {
      console.log('[Gallery] handleSizeChange => newSize:', newSize);
      setImageSize(newSize);
      // Persist it back to the store
      const newValue = {
        params: {
          ...((galleryData && galleryData.params) || {}),
          component: 'ui_gallery',
          files: originalOrder.current,
          imageSize: newSize,
        }
      };
      updateStore?.(fieldKey, newValue);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    console.log('[Gallery] handleDrop => user dropped files');

    const items = Array.from(e.dataTransfer.items);
    const files = items
      .filter((item: any) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item: any) => item.getAsFile());

    console.log('[Gallery] => handleDrop => Found image files:', files.map((f) => f.name));

    if (files.length === 0) return;

    try {
      const newImages = await Promise.all(
        files.map(async (file: File) => {
          console.log('[Gallery] => handleDrop => uploading file:', file.name);
          const formData = new FormData();
          const timestamp = Date.now();
          const fileName = `${timestamp}_${file.name}`;
          formData.append('file', file, fileName);

          const response = await fetch(`http://${config.serverAddress}/data/files`, {
            method: 'POST',
            body: formData,
          });
          if (!response.ok) {
            throw new Error(`Failed to upload file: ${response.statusText}`);
          }

          const savedFileName = await response.text();
          console.log('[Gallery] => handleDrop => server saved file as:', savedFileName);
          return { filename: savedFileName, starred: false, prompt: '' };
        })
      );

      console.log('[Gallery] => handleDrop => newImages:', newImages);

      const updatedImages = [...originalOrder.current, ...newImages];
      originalOrder.current = updatedImages;

      // For each newly added image, call loadImage
      newImages.forEach((image) => {
        const baseFileName = image.filename.split('/').pop() || image.filename;
        if (!imageUrls[baseFileName]) {
          loadImage(image.filename);
        }
      });

      // If showStarredOnly is turned on, exclude non-starred
      let filteredImages = showStarredOnly
        ? updatedImages.filter((img) => img.starred)
        : updatedImages;

      // Re-sort
      const newSortedImages = (sortOrder === 'newest')
        ? [...filteredImages].reverse()
        : [...filteredImages];

      // Persist new set of files to the store
      const newValue = { params: { component: 'ui_gallery', files: updatedImages } };
      updateStore?.(fieldKey, newValue);

      setDisplayedImages(newSortedImages);
    } catch (error) {
      console.error('[Gallery] => handleDrop => Error handling dropped files:', error);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleReorder = (e: React.DragEvent<HTMLElement>, targetImage: ImageObject): void => {
    e.preventDefault();
    const fromFilename: string = e.dataTransfer.getData('drag-filename');
    if (!fromFilename) return;
    if (fromFilename === targetImage.filename) return;

    const order = [...originalOrder.current];
    const fromIndex = order.findIndex((img) => img.filename === fromFilename);
    const toIndex = order.findIndex((img) => img.filename === targetImage.filename);
    if (fromIndex === -1 || toIndex === -1) return;

    const [movedItem] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, movedItem);
    originalOrder.current = order;

    // If user is reordering, we set sortOrder to 'custom'
    setSortOrder('custom');

    let newDisplayedImages = showStarredOnly
      ? order.filter((img) => img.starred)
      : [...order];
    setDisplayedImages(newDisplayedImages);

    const newValue = { params: { component: 'ui_gallery', files: order } };
    updateStore?.(fieldKey, newValue);
  };

  const handleStarToggle = async (filename: string) => {
    console.log('[Gallery] handleStarToggle => toggling star for', filename);
    const imageIndex = originalOrder.current.findIndex((img) => img.filename === filename);
    if (imageIndex === -1) return;

    const updatedImage = {
      ...originalOrder.current[imageIndex],
      starred: !originalOrder.current[imageIndex].starred
    };
    originalOrder.current[imageIndex] = updatedImage;

    const newStarredImages = new Set(
      originalOrder.current.filter((img) => img.starred).map((img) => img.filename)
    );
    setStarredImages(newStarredImages);

    let newDisplayedImages = showStarredOnly
      ? originalOrder.current.filter((img) => img.starred)
      : [...originalOrder.current];

    newDisplayedImages = (sortOrder === 'newest')
      ? [...newDisplayedImages].reverse()
      : newDisplayedImages;
    setDisplayedImages(newDisplayedImages);

    // Persist
    const newValue = {
      params: { component: 'ui_gallery', files: originalOrder.current }
    };
    updateStore?.(fieldKey, newValue);
  };

  const handleDeleteNonStarred = async () => {
    console.log('[Gallery] handleDeleteNonStarred => user confirmed delete all non-starred');
    setIsDeletingNonStarred(true);
    try {
      const nonStarredImages = originalOrder.current.filter((img) => !img.starred);
      console.log('[Gallery] => handleDeleteNonStarred => nonStarredImages:', nonStarredImages);

      for (const imageObj of nonStarredImages) {
        const filename = imageObj.filename;
        const baseFilename = filename.includes('/') ? filename.split('/').pop() : filename;

        // Remove from imageUrls
        setImageUrls((prev) => {
          const newUrls = { ...prev };
          delete newUrls[baseFilename || ''];
          return newUrls;
        });

        // Delete from server
        try {
          await dataService.deleteNodeFile(galleryData.nodeId || '', baseFilename || '');
        } catch (err) {
          console.error('[Gallery] handleDeleteNonStarred => error deleting file from server:', err);
        }
      }

      // Now keep only the starred images
      originalOrder.current = originalOrder.current.filter((img) => img.starred);

      const newDisplayedImages = (sortOrder === 'newest')
        ? [...originalOrder.current].reverse()
        : [...originalOrder.current];

      setDisplayedImages(newDisplayedImages);

      // Save updated list
      const newValue = { params: { component: 'ui_gallery', files: originalOrder.current } };
      updateStore?.(fieldKey, newValue);
    } finally {
      setIsDeletingNonStarred(false);
      setDeleteNonStarredDialogOpen(false);
    }
  };

  // If hidden, we can either skip rendering or rely on a 'mellon-hidden' class
  return (
    <Box
      key={fieldKey}
      data-key={fieldKey}
      sx={{ ...style }}
      className={`nodrag ${disabled ? 'mellon-disabled' : ''} ${hidden ? 'mellon-hidden' : ''}`}
    >
      <Box
        sx={{
          p: 2,
          position: 'relative',
          minHeight: '200px',
          border: isDraggingOver ? '2px dashed #FFA500' : '2px dashed transparent',
          borderRadius: 2,
          transition: 'border-color 0.2s ease-in-out',
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* The image preview modal */}
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
            <Box sx={{ position: 'relative' }}>
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
              <Box sx={{ position: 'relative' }}>
                <img
                  src={selectedImage?.url}
                  alt="Selected image"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '90vh',
                    objectFit: 'contain',
                    borderRadius: '8px 8px 0 0',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                  }}
                />
                {/* Star / Delete buttons on top of the large preview */}
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 8,
                    left: 8,
                    display: 'flex',
                    gap: 1,
                    zIndex: 1
                  }}
                >
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
                    })?.starred
                      ? <StarIcon />
                      : <StarBorderIcon />
                    }
                  </IconButton>
                  <IconButton
                    onClick={() => {
                      const imageIndex = displayedImages.findIndex((img) => {
                        const baseFilename = img.filename.includes('/')
                          ? img.filename.split('/').pop()
                          : img.filename;
                        return imageUrls[baseFilename || ''] === selectedImage?.url;
                      });
                      if (imageIndex !== -1) {
                        handleDelete(imageIndex);
                        handleCloseModal();
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
                </Box>
              </Box>
              {selectedImage?.prompt && (
                <Box
                  sx={{
                    position: 'relative',
                    width: '100%',
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
                    gap: 2
                  }}
                >
                  {/* Copy-to-clipboard button */}
                  <IconButton
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(selectedImage.prompt);
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
                  >
                    {copySuccess ? <CheckIcon sx={{ fontSize: 16 }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
                  </IconButton>
                  <Box sx={{ flex: 1 }}>{selectedImage.prompt}</Box>
                </Box>
              )}
            </Box>
            <IconButton
              onClick={() => handleNavigateImage('prev')}
              sx={{
                position: 'absolute',
                left: -56,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'white',
                bgcolor: 'rgba(0, 0, 0, 0.5)',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  bgcolor: 'rgba(0, 0, 0, 0.7)',
                  transform: 'translateY(-50%) scale(1.1)'
                },
                '&.Mui-disabled': {
                  display: 'none'
                }
              }}
              disabled={!displayedImages.some((_, idx) => idx < displayedImages.length && idx === 0)}
            >
              <ChevronLeftIcon />
            </IconButton>
            <IconButton
              onClick={() => handleNavigateImage('next')}
              sx={{
                position: 'absolute',
                right: -56,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'white',
                bgcolor: 'rgba(0, 0, 0, 0.5)',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  bgcolor: 'rgba(0, 0, 0, 0.7)',
                  transform: 'translateY(-50%) scale(1.1)'
                },
                '&.Mui-disabled': {
                  display: 'none'
                }
              }}
              disabled={!displayedImages.some((_, idx) => idx === displayedImages.length - 1)}
            >
              <ChevronRightIcon />
            </IconButton>
          </Box>
        </Modal>

        {/* Top bar: Items/page, columns, sorting, starred toggle */}
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
                    setItemsPerPage(e.target.value as number);
                    setPage(1);
                  }}
                  sx={{ color: 'text.primary' }}
                >
                  {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ width: 80 }}>
                <InputLabel id="columns-label">Columns</InputLabel>
                <Select
                  labelId="columns-label"
                  value={numColumns}
                  label="Columns"
                  onChange={(e) => setNumColumns(e.target.value as number)}
                  sx={{ color: 'text.primary' }}
                >
                  {COLUMNS_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
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
                  color: 'text.primary',
                },
              }}
            />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <Button
              onClick={() => handleSortChange(null, sortOrder === 'newest' ? 'oldest' : 'newest')}
              size="small"
              startIcon={<SortIcon sx={{ transform: sortOrder === 'newest' ? 'scaleY(-1)' : 'none' }} />}
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
                console.log('[Gallery] Toggling showStarredOnly =>', newShowStarredOnly);
                setShowStarredOnly(newShowStarredOnly);

                const filteredImages = newShowStarredOnly
                  ? originalOrder.current.filter((img) => img.starred)
                  : originalOrder.current;

                const sortedImages = (sortOrder === 'newest')
                  ? [...filteredImages].reverse()
                  : [...filteredImages];

                const newTotalPages = Math.ceil(filteredImages.length / itemsPerPage);
                if (page > newTotalPages) {
                  setPage(1);
                }

                setDisplayedImages(sortedImages);
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

        {/* The main image grid */}
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
            {currentPageImages.map((imageObj, index) => {
              // Skip invalid objects
              if (!imageObj || !imageObj.filename) {
                console.warn('[Gallery] => invalid imageObj encountered:', imageObj);
                return null;
              }

              const filename = imageObj.filename;
              const baseFilename = filename.includes('/') ? filename.split('/').pop() : filename;
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
                  onDrop={(e) => {
                    e.stopPropagation();
                    handleReorder(e, imageObj);
                  }}
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
                        <img
                          src={imageUrls[baseFilename || '']}
                          alt={`Generated image ${index + 1}`}
                          loading="lazy"
                          draggable="true"
                          onLoad={() => handleImageLoad(baseFilename || '')}
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDoubleClick={() => handleImageDoubleClick(imageUrls[baseFilename || ''], imageObj)}
                          style={{
                            width: IMAGE_SIZES[imageSize],
                            height: IMAGE_SIZES[imageSize],
                            objectFit: 'cover',
                            borderRadius: '4px',
                            cursor: 'grab',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            transition: 'box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            opacity: loadedImages[baseFilename || ''] ? 1 : 0
                          }}
                        />
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
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          '& .MuiTouchRipple-root': {
                            display: 'none'
                          }
                        }}
                      >
                        {isStarred ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
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
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          visibility: isDeletingImage === index ? 'hidden' : 'visible',
                          '& .MuiTouchRipple-root': {
                            display: 'none'
                          }
                        }}
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  )}
                </ImageListItem>
              );
            }).filter(Boolean)}
          </ImageList>
          {/* A small toggle in the corner to change image size */}
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

        {/* Button to delete all non-starred images */}
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
            This will permanently delete all images that are not starred. This action cannot be undone.
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
