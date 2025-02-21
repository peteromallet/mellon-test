import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
  memo,
  useReducer,
  RefObject
} from 'react';
import config from '../../../config';

import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  IconButton,
  Slider,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton
} from '@mui/material';

import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';

import { unstable_batchedUpdates } from 'react-dom';

// ------------------ INTERFACES & TYPES ------------------

interface DragState {
  isDragging: boolean;
  draggedTimestamp: string | null;
  draggedOver: string | null;
  mousePosition: number | null;
  isImageDraggingOver: boolean;
  lastUpdateTime: number;
  lastMousePosition: {
    mouseX: number;
    timelineRect: DOMRect;
  } | null;
  // FIX: added `| undefined` to allow null assignment without error
  rafId: number | null | undefined;
  isDraggingValid: boolean;
  // This might also be null or undefined, so let's allow for that:
  scrollDirectionTimeout?: number | null;
}

interface Timestamp {
  id: string;
  time: string;
  image?: string | null;
}

interface DragAction {
  type: 'START_DRAG' | 'UPDATE_DRAG' | 'END_DRAG' | 'SET_IMAGE_DRAGGING';
  payload?: {
    id?: string;
    position?: number;
    draggedOver?: string;
    isImageDraggingOver?: boolean;
  };
}

interface TimelineSizes {
  small: {
    height: number;
    width: number;
    imageSize: number;
    fontSize: number;
    dropZoneSize: number;
    labelOffset: number;
  };
  medium: {
    height: number;
    width: number;
    imageSize: number;
    fontSize: number;
    dropZoneSize: number;
    labelOffset: number;
  };
  large: {
    height: number;
    width: number;
    imageSize: number;
    fontSize: number;
    dropZoneSize: number;
    labelOffset: number;
  };
}

const TIMELINE_SIZES: TimelineSizes = {
  small: {
    height: 140,
    width: 800,
    imageSize: 77,
    fontSize: 12,
    dropZoneSize: 40,
    labelOffset: 2
  },
  medium: {
    height: 210,
    width: 1000,
    imageSize: 115,
    fontSize: 14,
    dropZoneSize: 60,
    labelOffset: 5
  },
  large: {
    height: 280,
    width: 1200,
    imageSize: 154,
    fontSize: 16,
    dropZoneSize: 80,
    labelOffset: 16
  }
};

interface DragIndicatorProps {
  dragState: DragState;
  imageSize: keyof TimelineSizes;
  isImageDraggingOver: boolean;
}

interface TimestampMarkerProps {
  stamp: Timestamp;
  index: number;
  imageSize: keyof TimelineSizes;
  imageUrls: Record<string, string>;
  selectedTimestamp: string | null;
  hoveredTimestamp: string | null;
  dragState: DragState;
  isDeletingTimestamp: string | null;
  handleSelection: (stampId: string, e: React.MouseEvent<HTMLDivElement>) => void;
  handleTimestampDrop: (e: React.DragEvent<HTMLDivElement>, stampId: string) => void;
  handleImageDrop: (
    fileOrUrl: File | string,
    e: React.DragEvent<HTMLDivElement> | React.ChangeEvent<HTMLInputElement> | any,
    timestampId: string
  ) => Promise<void>;
  handleImageError: (imageName: string, event?: React.SyntheticEvent<HTMLImageElement>) => void;
  setTimestamps: React.Dispatch<React.SetStateAction<Timestamp[]>>;
  setSelectedTimestamp: React.Dispatch<React.SetStateAction<string | null>>;
  setImageUrls: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setIsDeletingTimestamp: React.Dispatch<React.SetStateAction<string | null>>;
  setLastDeletedTimestamp: React.Dispatch<React.SetStateAction<Timestamp | null>>;
  setHoveredTimestamp: React.Dispatch<React.SetStateAction<string | null>>;
  isHandlingUploadRef: React.MutableRefObject<boolean>;
  setActiveUploadId: React.Dispatch<React.SetStateAction<string | null>>;
  imageFileInputRef: RefObject<HTMLInputElement>;
  TIMELINE_SIZES: TimelineSizes;
  audioRef: RefObject<HTMLAudioElement>;
  isAtLeftEdge: boolean;
  isAtRightEdge: boolean;
  timelineRef: RefObject<HTMLDivElement>;
  DEADZONE_WIDTH: number;
  fallbackDuration: number;
  zoom: number;
  dispatch: React.Dispatch<DragAction>;
}

interface PomsSimpleTimelineProps {
  fieldKey: string;
  value: {
    timestamps: Timestamp[];
    audioFile?: string;
  };
  updateStore: (key: string, value: any) => void; // 'any' maintained as is, to not break existing usage
}

// ------------------ REDUCER ----------------------------
const dragReducer = (state: DragState, action: DragAction): DragState => {
  switch (action.type) {
    case 'START_DRAG':
      return {
        ...state,
        isDragging: true,
        draggedTimestamp: action.payload?.id || null,
        mousePosition: action.payload?.position !== undefined ? action.payload.position : null,
        draggedOver: null,
        isImageDraggingOver: false
      };
    case 'UPDATE_DRAG':
      return {
        ...state,
        mousePosition: action.payload?.position !== undefined ? action.payload.position : null,
        draggedOver: action.payload?.draggedOver || null,
        isImageDraggingOver: action.payload?.isImageDraggingOver ?? state.isImageDraggingOver
      };
    case 'END_DRAG':
      return {
        ...state,
        isDragging: false,
        draggedTimestamp: null,
        mousePosition: null,
        draggedOver: null,
        isImageDraggingOver: false
      };
    case 'SET_IMAGE_DRAGGING':
      return {
        ...state,
        isImageDraggingOver: action.payload?.isImageDraggingOver || false
      };
    default:
      return state;
  }
};

// ------------------ DRAG INDICATOR COMPONENT -----------
const DragIndicator: React.FC<DragIndicatorProps> = memo(
  ({ dragState, imageSize, isImageDraggingOver }) => {
    if (!isImageDraggingOver) return null;

    return (
      <Box
        sx={{
          position: 'absolute',
          zIndex: 99998,
          transform: 'translateX(-50%)',
          left: `${dragState.mousePosition}%`,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          opacity: dragState.mousePosition === null ? 0 : 1,
          '& > div': {
            width: `${TIMELINE_SIZES[imageSize].imageSize}px`,
            height: `${TIMELINE_SIZES[imageSize].imageSize * 1.5}px`,
            border: '2px solid rgba(255, 165, 0, 0.5)',
            borderRadius: '4px',
            backgroundColor: 'rgba(255, 165, 0, 0.1)',
            marginTop: `${TIMELINE_SIZES[imageSize].imageSize * 0.3}px`
          }
        }}
      >
        <div />
      </Box>
    );
  }
);

// ------------------ TIMESTAMP MARKER COMPONENT ---------
const TimestampMarker: React.FC<TimestampMarkerProps> = memo(
  (
    {
      stamp,
      index,
      imageSize,
      imageUrls,
      selectedTimestamp,
      hoveredTimestamp,
      dragState,
      isDeletingTimestamp,
      handleSelection,
      handleTimestampDrop,
      handleImageDrop,
      handleImageError,
      setTimestamps,
      setSelectedTimestamp,
      setImageUrls,
      setIsDeletingTimestamp,
      setLastDeletedTimestamp,
      setHoveredTimestamp,
      isHandlingUploadRef,
      setActiveUploadId,
      imageFileInputRef,
      TIMELINE_SIZES,
      audioRef,
      isAtLeftEdge,
      isAtRightEdge,
      timelineRef,
      DEADZONE_WIDTH,
      fallbackDuration,
      zoom,
      dispatch
    }
  ) => {
    const [wasHidden, setWasHidden] = useState<boolean>(false);

    // Log missing references (debugging)
    useEffect(() => {
      if (!audioRef?.current || !timelineRef?.current) {
        console.log('DEBUG - TimestampMarker missing refs:', {
          hasAudio: !!audioRef?.current,
          hasTimeline: !!timelineRef?.current,
          stampId: stamp.id
        });
      }
    }, [audioRef?.current, timelineRef?.current, stamp.id]);

    const duration = audioRef.current?.duration || fallbackDuration;
    const stampTime = parseFloat(stamp.time) || 0;
    const timePercent = Math.min(100, (stampTime / duration) * 100);
    const leftPercent = timePercent;
    const isHidden = false; // We no longer hide markers based on deadzones

    useEffect(() => {
      if (isHidden !== wasHidden) {
        setWasHidden(isHidden);
        if (isHidden) {
          console.log('DEBUG - TimestampMarker hidden:', {
            id: stamp.id,
            time: stamp.time
          });
        }
      }
    }, [isHidden, stamp.id, stamp.time, wasHidden, zoom]);

    const handleDragStartExistingItem = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        if (!audioRef.current) return;
        e.stopPropagation();
        e.dataTransfer.setData(
          'text/plain',
          JSON.stringify({ type: 'existingItem', stampId: stamp.id })
        );
        e.dataTransfer.effectAllowed = 'move';

        dispatch({
          type: 'START_DRAG',
          payload: {
            id: stamp.id,
            position: undefined,  // Changed from null
            draggedOver: undefined,  // Changed from null
            isImageDraggingOver: false
          }
        });
      },
      [audioRef, stamp.id, dispatch]
    );

    const handleDragEndExistingItem = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        e.stopPropagation();
        dispatch({ type: 'END_DRAG' });
      },
      [dispatch]
    );

    return (
      <Box
        className={`timestamp-marker ${selectedTimestamp === stamp.id ? 'selected' : ''}`}
        onMouseEnter={() => setHoveredTimestamp(stamp.id)}
        onMouseLeave={() => setHoveredTimestamp(null)}
        draggable={true}
        data-stamp-id={stamp.id}
        onDragStart={handleDragStartExistingItem}
        onDragEnd={handleDragEndExistingItem}
        sx={{
          position: 'absolute',
          height: '100%',
          width: '4px',
          cursor: dragState.isDragging
            ? dragState.draggedTimestamp === stamp.id
              ? 'grabbing'
              : 'default'
            : 'grab',
          left: `${leftPercent}%`,
          transform: 'translateX(-50%)',
          display: 'flex',
          justifyContent: 'center',
          zIndex:
            dragState.draggedTimestamp === stamp.id
              ? 3000
              : selectedTimestamp === stamp.id
              ? 2500
              : hoveredTimestamp === stamp.id
              ? 2200
              : 1,
          pointerEvents: 'auto',
          opacity: 1,
          visibility: 'visible',
          transition: 'opacity 0.2s',
          willChange: 'transform, opacity',
          bgcolor: 'rgba(255, 165, 0, 0.5)',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '50%',
            width: '2px',
            bgcolor: 'orange',
            transform: 'translateX(-50%)'
          }
        }}
        onClick={(e: React.MouseEvent<HTMLDivElement>) => {
          // Only handle click if we're not dragging
          if (!dragState.isDragging) {
            handleSelection(stamp.id, e);
          }
        }}
        onDrop={(e: React.DragEvent<HTMLDivElement>) => handleTimestampDrop(e, stamp.id)}
      >
        {/* LABEL + IMAGE UPLOAD/THUMBNAIL AREA */}
        <Box
          sx={{
            position: 'absolute',
            bottom: TIMELINE_SIZES[imageSize].labelOffset,
            left: '50%',
            transform: 'translateX(-50%)',
            bgcolor: 'background.paper',
            px: 0.5,
            py: 0.25,
            borderRadius: 0.5,
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            zIndex: 2,
            pointerEvents: 'auto',
            width: 'fit-content',
            minWidth: '36px',
            height: '20px',
            '& > *': {
              zIndex: 'inherit'
            },
            '& > span': {
              pointerEvents: 'auto',
              padding: '2px 4px'
            },
            '&:hover': {
              '& .delete-button': {
                opacity: isDeletingTimestamp === stamp.id ? 0.5 : 1,
                visibility: 'visible',
                pointerEvents: isDeletingTimestamp === stamp.id ? 'none' : 'auto'
              }
            },
            '& .delete-button': {
              opacity: 0,
              visibility: dragState.isDragging ? 'hidden' : 'visible',
              transition: 'opacity 0.2s, visibility 0.2s'
            },
            ...(dragState.draggedOver === stamp.id && {
              '&::before': {
                content: '""',
                position: 'absolute',
                top: `-${TIMELINE_SIZES[imageSize].imageSize * 1.2}px`,
                left: `-${TIMELINE_SIZES[imageSize].imageSize * 0.2}px`,
                right: `-${TIMELINE_SIZES[imageSize].imageSize * 0.2}px`,
                bottom: '-4px',
                border: '2px solid rgba(255, 165, 0, 0.5)',
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 165, 0, 0.1)',
                zIndex: -1,
                pointerEvents: 'none'
              }
            })
          }}
        >
          {dragState.draggedOver === stamp.id && (
            <Box
              sx={{
                position: 'absolute',
                top: `-${TIMELINE_SIZES[imageSize].imageSize * 1.2}px`,
                left: `-${TIMELINE_SIZES[imageSize].imageSize * 0.2}px`,
                right: `-${TIMELINE_SIZES[imageSize].imageSize * 0.2}px`,
                bottom: '-4px',
                border: '2px solid rgba(255, 165, 0, 0.5)',
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 165, 0, 0.1)',
                zIndex: -1,
                pointerEvents: 'none'
              }}
            />
          )}

          {/* If we have an image, display the thumbnail + delete button */}
          {stamp.image && imageUrls[stamp.image] ? (
            <Box
              sx={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: dragState.draggedTimestamp === stamp.id
                  ? `translateX(-50%) scale(1.5) translateY(${imageSize === 'large' ? -24 : imageSize === 'medium' ? -12 : -5}px)`
                  : (hoveredTimestamp === stamp.id || selectedTimestamp === stamp.id) && !dragState.isDragging
                  ? `translateX(-50%) scale(1.5) translateY(${imageSize === 'large' ? -24 : imageSize === 'medium' ? -12 : -5}px)`
                  : `translateX(-50%) scale(1) translateY(${imageSize === 'large' ? -12 : imageSize === 'medium' ? -8 : 4}px)`,
                width: TIMELINE_SIZES[imageSize].imageSize,
                height: TIMELINE_SIZES[imageSize].imageSize,
                marginBottom: '12px',
                borderRadius: 1,
                overflow: 'visible',
                border: dragState.draggedTimestamp === stamp.id || ((hoveredTimestamp === stamp.id || selectedTimestamp === stamp.id) && !dragState.isDragging)
                  ? '1px solid rgba(0, 0, 0, 0.8)'
                  : '1px solid rgba(0, 0, 0, 0.5)',
                boxShadow: dragState.draggedTimestamp === stamp.id
                  ? '0 8px 16px rgba(0,0,0,0.3)'
                  : '0 2px 4px rgba(0,0,0,0.1)',
                transition: dragState.draggedTimestamp === stamp.id ? 'none' : 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out, border 0.2s ease-in-out',
                cursor: 'move',
                zIndex: 1000000,
                pointerEvents: dragState.isDragging ? (dragState.draggedTimestamp === stamp.id ? 'auto' : 'none') : 'auto',
                '&:hover': {
                  '& .image-delete-button': {
                    opacity: dragState.isDragging ? 0 : 1,
                    transform: dragState.isDragging ? 'scale(0.8)' : 'scale(1)',
                    visibility: dragState.isDragging ? 'hidden' : 'visible'
                  }
                }
              }}
            >
              <Box
                component="img"
                src={
                  imageUrls[stamp.image] ||
                  (stamp.image && stamp.image.startsWith('http')
                    ? stamp.image
                    : `http://${config.serverAddress}/data/files/${stamp.image}`)
                }
                alt={`Timestamp ${stamp.time}`}
                onError={(e) => handleImageError(stamp.image || '', e)}
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  pointerEvents: 'none',
                  borderRadius: 'inherit'
                }}
              />
              <IconButton
                className="image-delete-button"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();

                  if (isDeletingTimestamp === stamp.id) return;
                  setIsDeletingTimestamp(stamp.id);

                  try {
                    if (stamp.image && imageUrls[stamp.image]) {
                      URL.revokeObjectURL(imageUrls[stamp.image]);
                      setImageUrls((prev) => {
                        const newUrls = { ...prev };
                        delete newUrls[stamp.image as string];
                        return newUrls;
                      });
                    }
                    setLastDeletedTimestamp(stamp);
                    setTimestamps((prev) => prev.filter((t) => t.id !== stamp.id));
                  } catch (error) {
                    console.error('Error removing image reference:', error);
                  } finally {
                    setIsDeletingTimestamp(null);
                  }
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                }}
                sx={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: 16,
                  height: 16,
                  padding: 0,
                  minWidth: 'unset',
                  opacity: 0,
                  transform: 'scale(0.8)',
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: 'white',
                  fontSize: '12px',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  zIndex: 31,
                  pointerEvents: dragState.isDragging ? 'none' : 'auto',
                  visibility: dragState.isDragging ? 'hidden' : 'visible',
                  borderRadius: '0 4px 0 4px',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 0, 0, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.5)',
                    transform: 'scale(1.1)'
                  },
                  '& .MuiTouchRipple-root': {
                    display: 'none'
                  }
                }}
              >
                ×
              </IconButton>
            </Box>
          ) : !dragState.draggedTimestamp ? (
            <Box
              data-upload-container="true"
              onMouseEnter={() => setHoveredTimestamp(stamp.id)}
              onMouseLeave={() => setHoveredTimestamp(null)}
              sx={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginBottom: '14px',
                zIndex: 999999,
                padding: '4px',
                width: '32px',
                height: '32px',
                backgroundColor: 'transparent',
                isolation: 'isolate'
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
              onMouseUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
            >
              <IconButton
                className="image-upload-button"
                size="small"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                  isHandlingUploadRef.current = true;
                  setActiveUploadId(stamp.id);
                  if (imageFileInputRef.current) {
                    imageFileInputRef.current.value = '';
                    imageFileInputRef.current.click();
                  }
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  e.nativeEvent.stopImmediatePropagation();
                  isHandlingUploadRef.current = true;
                }}
                onMouseUp={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  e.nativeEvent.stopImmediatePropagation();
                }}
                sx={{
                  p: 0.5,
                  bgcolor: 'grey.500',
                  color: 'white',
                  width: '24px',
                  height: '24px',
                  opacity: hoveredTimestamp === stamp.id && !dragState.isDragging ? 1 : 0,
                  visibility: hoveredTimestamp === stamp.id && !dragState.isDragging ? 'visible' : 'hidden',
                  transition: 'opacity 0.2s',
                  position: 'relative',
                  zIndex: 999999,
                  '&:hover': { bgcolor: 'grey.600' }
                }}
              >
                <AddPhotoAlternateIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          ) : null}

          <Typography
            sx={{
              fontSize: `${TIMELINE_SIZES[imageSize].fontSize}px`,
              color: 'text.primary'
            }}
          >
            {parseFloat(stamp.time).toFixed(2)}s
          </Typography>

          {!stamp.image && (
            <Button
              className="delete-button"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();

                if (isDeletingTimestamp === stamp.id) return;
                setIsDeletingTimestamp(stamp.id);

                try {
                  // Since there is no image, simply delete the timestamp
                  setLastDeletedTimestamp(stamp);
                  setTimestamps((prev) => prev.filter((t) => t.id !== stamp.id));
                } catch (error) {
                  console.error('Error removing timestamp:', error);
                } finally {
                  setIsDeletingTimestamp(null);
                }
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
              sx={{
                position: 'absolute',
                right: -4,
                top: -4,
                width: 16,
                height: 16,
                minWidth: 'unset',
                padding: 0,
                color: '#FFA500',
                bgcolor: 'transparent',
                fontSize: '14px',
                lineHeight: 1,
                cursor: isDeletingTimestamp === stamp.id ? 'not-allowed' : 'pointer',
                zIndex: 1000,
                opacity: isDeletingTimestamp === stamp.id ? 0.5 : 0,
                transform: 'scale(0.8)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                pointerEvents: isDeletingTimestamp === stamp.id ? 'none' : 'auto',
                visibility: dragState.isDragging ? 'hidden' : 'visible',
                '&:hover': {
                  color: '#FF4444',
                  transform: 'scale(1.1)'
                }
              }}
            >
              <div className="click-area" />
              <div className="hover-effect" />
              ×
            </Button>
          )}
        </Box>
      </Box>
    );
  },
  (prevProps: TimestampMarkerProps, nextProps: TimestampMarkerProps) => {
    // Custom memo comparison
    return (
      prevProps.stamp.id === nextProps.stamp.id &&
      prevProps.stamp.time === nextProps.stamp.time &&
      prevProps.stamp.image === nextProps.stamp.image &&
      prevProps.selectedTimestamp === nextProps.selectedTimestamp &&
      prevProps.hoveredTimestamp === nextProps.hoveredTimestamp &&
      prevProps.dragState.draggedTimestamp === nextProps.dragState.draggedTimestamp &&
      prevProps.dragState.draggedOver === nextProps.dragState.draggedOver &&
      prevProps.dragState.isDragging === nextProps.dragState.isDragging &&
      prevProps.dragState.isImageDraggingOver === nextProps.dragState.isImageDraggingOver &&
      prevProps.isDeletingTimestamp === nextProps.isDeletingTimestamp &&
      prevProps.imageSize === nextProps.imageSize &&
      prevProps.isAtLeftEdge === nextProps.isAtLeftEdge &&
      prevProps.isAtRightEdge === nextProps.isAtRightEdge
    );
  }
);

// ------------------ MAIN COMPONENT ---------------------
const PomsSimpleTimeline: React.FC<PomsSimpleTimelineProps> = ({
  fieldKey,
  value,
  updateStore
}) => {
  // --------------------- LOCAL STATES ---------------------

  // FIX: allow both null and undefined to handle linter complaining about 'null' vs 'undefined'
  const [audioFile, setAudioFile] = useState<string | null | undefined>(() => {
    if (value?.audioFile) {
      return `http://${config.serverAddress}/data/files/${value.audioFile}`;
    }
    return null;
  });

  // FIX: similarly for audioFileName
  const [audioFileName, setAudioFileName] = useState<string | null | undefined>(
    value?.audioFile || null
  );

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [timestamps, setTimestamps] = useState<Timestamp[]>(value?.timestamps || []);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1);
  const [viewportStart, setViewportStart] = useState<number>(0);

  // FIX: allow null|undefined for lastHitTimestamp to avoid type error
  const [lastHitTimestamp, setLastHitTimestamp] = useState<string | null | undefined>(undefined);

  const [lastHitColor, setLastHitColor] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [hoveredTimestamp, setHoveredTimestamp] = useState<string | null>(null);
  const [selectedTimestamp, setSelectedTimestamp] = useState<string | null>(null);
  const [isDeletingTimestamp, setIsDeletingTimestamp] = useState<string | null>(null);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<keyof TimelineSizes>('small');

  // FIX: allow null|undefined if we set it that way
  const [autoScrollDirection, setAutoScrollDirection] = useState<string | null | undefined>(null);

  // FIX: allow null|undefined for intervals
  const [autoScrollInterval, setAutoScrollInterval] = useState<number | null | undefined>(undefined);

  const [isAtLeftEdge, setIsAtLeftEdge] = useState<boolean>(true);
  const [isAtRightEdge, setIsAtRightEdge] = useState<boolean>(false);
  const [lastTimeUpdate, setLastTimeUpdate] = useState<number>(0);
  const [smoothCurrentTime, setSmoothCurrentTime] = useState<number>(0);
  const [lastDeletedTimestamp, setLastDeletedTimestamp] = useState<Timestamp | null>(null);
  const [scrollSpeed, setScrollSpeed] = useState<number>(0);
  const [isImageDraggingOver, setIsImageDraggingOver] = useState<boolean>(false);

  const [fallbackDuration, setFallbackDuration] = useState<number>(() => {
    const maxTime = Math.max(
      ...(value?.timestamps || []).map((t) => parseFloat(t.time) || 0),
      0
    );
    return Math.max(1, maxTime * 1.1); // 10% buffer
  });

  // --------------------- REFS ----------------------------
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const isZoomingRef = useRef<boolean>(false);

  // FIX: allow number|undefined in these refs if we set them to null or undefined
  const lastManualSeekRef = useRef<number | null | undefined>(undefined);
  const lastActualTimeRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null | undefined>(undefined);
  const lastManualSelectionRef = useRef<number | null | undefined>(undefined);
  const isHandlingUploadRef = useRef<boolean>(false);

  // FIX: allow undefined
  const zoomTimeoutRef = useRef<number | null | undefined>(undefined);
  const lastZoomTimeRef = useRef<number>(0);

  // For skipping recently visited timestamps
  const recentlyVisitedTimestampsRef = useRef<Map<string, number>>(new Map());
  const TIMESTAMP_COOLDOWN = 250; // ms
  const SCROLL_THRESHOLD = 150; // For auto-scroll
  const SCROLL_SPEED = 15;
  const DEADZONE_WIDTH = 100;
  const SCROLL_ACCELERATION = 2;
  const ZOOM_THROTTLE = 5; // ms

  // --------------------- DRAG REDUCER ---------------------
  const [dragState, dispatch] = useReducer(dragReducer, {
    isDragging: false,
    draggedTimestamp: null,
    mousePosition: null,
    draggedOver: null,
    isImageDraggingOver: false,
    lastUpdateTime: 0,
    lastMousePosition: null,
    // FIX: include null|undefined
    rafId: undefined,
    isDraggingValid: false
  } as DragState);

  // For file type validation
  const fileTypeToAccept = {
    image: '.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg',
    audio: '.mp3,.wav,.ogg,.mp4,.aac,.webm',
    video: '.mp4,.webm,.ogg',
    text: '.txt,.md,.html,.css,.js,.json',
    any: '*/*'
  };

  // FIX: allow null|undefined
  const [fileError, setFileError] = useState<string | null | undefined>(undefined);

  // --------------------- DATA UPDATE HELPERS --------------
  const commitTimestampsUpdate = useCallback(
    (newTimestamps: Timestamp[]) => {
      setTimestamps(newTimestamps);
      const newValue = { ...value, timestamps: newTimestamps };
      updateStore(fieldKey, newValue);
    },
    [value, fieldKey, updateStore]
  );

  const commitAudioFileUpdate = useCallback(
    (newAudioPath: string) => {
      const fullUrl = `http://${config.serverAddress}/data/files/${newAudioPath}`;
      setAudioFile(fullUrl);
      setAudioFileName(newAudioPath);
      const newValue = { ...value, audioFile: newAudioPath, timestamps: value?.timestamps || [] };
      updateStore(fieldKey, newValue);
    },
    [value, fieldKey, updateStore]
  );

  const setTimestampsSafe = useCallback(
    (
      fnOrArray: Timestamp[] | ((prev: Timestamp[]) => Timestamp[])
    ) => {
      setTimestamps((prev) => {
        const next =
          typeof fnOrArray === 'function' ? fnOrArray(prev) : fnOrArray;
        commitTimestampsUpdate(next);
        return next;
      });
    },
    [commitTimestampsUpdate]
  );

  const generateUniqueId = () => {
    return Math.random().toString(36).substr(2, 9);
  };

  const validateFile = useCallback(
    (file: File, fileType: keyof typeof fileTypeToAccept) => {
      if (!file) return false;
      if (fileType === 'any') return true;
      const fileTypeMap: Record<string, RegExp> = {
        image: /^image\/(jpeg|png|gif|webp|bmp|svg\+xml)$/i,
        audio: /^audio\/(mpeg|wav|ogg|mp4|aac|webm)$/i,
        video: /^video\/(mp4|webm|ogg)$/i,
        text: /^text\/(plain|markdown|html|css|javascript|json)$/i
      };
      const validationRegex = fileTypeMap[fileType];
      if (!validationRegex) return true;
      if (!validationRegex.test(file.type)) {
        setFileError(
          `Invalid file type. Allowed: ${fileTypeToAccept[fileType]
            .split(',')
            .join(', ')}`
        );
        return false;
      }
      setFileError(undefined);
      return true;
    },
    [fileTypeToAccept]
  );

  // --------------------- IMAGE HANDLING -------------------
  const loadImage = useCallback(async (imageName: string) => {
    try {
      const imageUrl = `http://${config.serverAddress}/data/files/${imageName}`;
      const img = new Image();
      const loadPromise = new Promise<string>((resolve, reject) => {
        img.onload = () => resolve(imageUrl);
        img.onerror = () =>
          reject(new Error(`Image failed to load from ${imageUrl}`));
        img.src = imageUrl;
      });
      await loadPromise;
      setImageUrls((prev) => ({
        ...prev,
        [imageName]: imageUrl
      }));
      return imageUrl;
    } catch (error) {
      console.error('Timeline: Error loading image:', error);
      throw error;
    }
  }, []);

  const handleImageError = (
    imageName: string,
    event?: React.SyntheticEvent<HTMLImageElement>
  ) => {
    const attemptedUrl =
      event && event.target
        ? (event.target as HTMLImageElement).src
        : imageName;
    console.error(`Timeline: Error loading image at ${attemptedUrl}`);
    console.log(
      `Timeline: Image failed to load from location: ${attemptedUrl}, identifier: ${imageName}. Attempting reload.`
    );

    const retryLoad = (attempt = 0) => {
      if (attempt >= 3) {
        console.error(
          'Timeline: Failed to load image after 3 attempts for location:',
          attemptedUrl
        );
        return;
      }
      setTimeout(() => {
        console.log(`Timeline: Retry attempt ${attempt + 1} for: ${attemptedUrl}`);
        loadImage(imageName).catch((error) => {
          console.error(`Timeline: Retry ${attempt + 1} failed for ${attemptedUrl}:`, error);
          retryLoad(attempt + 1);
        });
      }, Math.min(1000 * Math.pow(2, attempt), 5000));
    };
    retryLoad();
  };

  useEffect(() => {
    timestamps.forEach((timestamp) => {
      if (timestamp.image && !imageUrls[timestamp.image]) {
        loadImage(timestamp.image).catch((error) => {
          console.error('Failed to load image:', timestamp.image, error);
        });
      }
    });
  }, [timestamps, imageUrls, loadImage]);

  // --------------------- FILE UPLOADS ---------------------
  const handleFileInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
    timestampId: string
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      if (!validateFile(file, 'image')) {
        return;
      }
    }
    try {
      await handleImageDrop(file, event, timestampId);
    } finally {
      isHandlingUploadRef.current = false;
    }
  };

  const handleZoom = useCallback(
    (direction: 'in' | 'out') => {
      if (!timelineRef.current?.parentElement || !audioRef.current) return;
      const now = Date.now();
      if (now - lastZoomTimeRef.current < ZOOM_THROTTLE) return;
      lastZoomTimeRef.current = now;

      isZoomingRef.current = true;
      const timeline = timelineRef.current;
      const container = timeline.parentElement;
      if (!container) return; // FIX: null check for container
      const duration = audioRef.current.duration || 1;
      const currentT = audioRef.current.currentTime;

      const zoomFactor = direction === 'in' ? 1.5 : 1 / 1.5;
      const newZoom = Math.min(Math.max(zoom * zoomFactor, 1), 22.5);

      const baseTimelineWidth = container.offsetWidth;
      const playheadPercent = currentT / duration;

      const containerWidth = container.offsetWidth;
      const newTimelineWidth = baseTimelineWidth * newZoom;
      const newPlayheadPixels = newTimelineWidth * playheadPercent;
      const targetScroll = Math.max(0, newPlayheadPixels - containerWidth / 2);

      container.style.scrollBehavior = 'auto';
      timeline.style.transition = 'none';
      timeline.style.width = `${newTimelineWidth}px`;
      container.scrollLeft = targetScroll;

      // Force reflow:
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      timeline.offsetHeight;

      setZoom(newZoom);

      requestAnimationFrame(() => {
        timeline.style.transition = '';
        container.style.scrollBehavior = 'smooth';
        setTimeout(() => {
          isZoomingRef.current = false;
        }, 100);
      });
    },
    [zoom]
  );

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!validateFile(file, 'audio')) {
      if (audioFileInputRef.current) {
        audioFileInputRef.current.value = '';
      }
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`http://${config.serverAddress}/data/files`, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      const savedFileName = await response.text();
      commitAudioFileUpdate(savedFileName);

      setViewportStart(0);
      setZoom(1);

      if (audioRef.current) {
        audioRef.current.load();
        await new Promise<void>((resolve) => {
          const handleLoaded = () => {
            if (!audioRef.current) return;
            audioRef.current.removeEventListener('loadedmetadata', handleLoaded);
            resolve();
          };
          if (audioRef.current) {  // Add null check
            audioRef.current.addEventListener('loadedmetadata', handleLoaded);
          } else {
            resolve();  // Resolve immediately if no audio ref
          }
        });
      }
    } catch (error) {
      console.error('Error saving file:', error);
      alert('Failed to save file. Please try again.');
    }
  };

  const handleImageDrop = useCallback(
    async (
      fileOrUrl: File | string,
      e: React.DragEvent<HTMLDivElement> | React.ChangeEvent<HTMLInputElement> | any,
      timestampId: string
    ) => {
      console.log('Timeline: handleImageDrop:', { fileOrUrl, timestampId });
      try {
        if (typeof fileOrUrl === 'string') {
          // It's presumably a URL
          const filename = fileOrUrl.split('/').pop() || 'pasted_image.jpg';
          setImageUrls((prev) => ({
            ...prev,
            [filename]: fileOrUrl
          }));
          setTimestampsSafe((prev) =>
            prev.map((t) =>
              t.id === timestampId ? { ...t, image: filename } : t
            )
          );
          setSelectedTimestamp(timestampId);
        } else {
          // It's a File
          const tempUrl = URL.createObjectURL(fileOrUrl);
          const imageName = `${timestampId}_${fileOrUrl.name}`;

          // Show it immediately
          setImageUrls((prev) => ({
            ...prev,
            [imageName]: tempUrl
          }));
          setTimestampsSafe((prev) =>
            prev.map((t) =>
              t.id === timestampId
                ? { ...t, image: imageName }
                : t
            )
          );
          setSelectedTimestamp(timestampId);

          // Actual upload
          const formData = new FormData();
          formData.append('file', fileOrUrl, imageName);
          const response = await fetch(`http://${config.serverAddress}/data/files`, {
            method: 'POST',
            body: formData
          });
          if (!response.ok) {
            throw new Error('Upload failed');
          }
          const savedFileName = await response.text();
          try {
            await loadImage(savedFileName);
            // Cleanup local object URL
            URL.revokeObjectURL(tempUrl);

            setTimestampsSafe((prev) =>
              prev.map((t) =>
                t.id === timestampId ? { ...t, image: savedFileName } : t
              )
            );
          } catch (error) {
            console.error('Timeline: Server image failed to load:', error);
            // revert to local if needed
            setImageUrls((prev) => ({
              ...prev,
              [imageName]: tempUrl
            }));
          }
        }
      } catch (error) {
        console.error('Timeline: Error in handleImageDrop:', error);
        throw error;
      }
    },
    [loadImage, setTimestampsSafe]
  );

  // --------------------- PLAYBACK -------------------------
  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setLastHitColor(null);
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const updateSmoothPlayhead = useCallback(() => {
    if (!audioRef.current) return; // FIX: null check
    const now = performance.now();
    const actualTime = audioRef.current.currentTime;

    if (
      !isPlaying ||
      (lastManualSeekRef.current && now - lastManualSeekRef.current < 50)
    ) {
      setSmoothCurrentTime(actualTime);
      lastActualTimeRef.current = actualTime;
      lastFrameTimeRef.current = now;
      if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(updateSmoothPlayhead);
      }
      return;
    }
    setSmoothCurrentTime(actualTime);
    lastActualTimeRef.current = actualTime;
    lastFrameTimeRef.current = now;
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateSmoothPlayhead);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      lastFrameTimeRef.current = performance.now();
      lastActualTimeRef.current = audioRef.current?.currentTime || 0;
      animationFrameRef.current = requestAnimationFrame(updateSmoothPlayhead);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Force one update
      updateSmoothPlayhead();
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, updateSmoothPlayhead]);

  useEffect(() => {
    if (audioRef.current && audioFile) {
      const handleMetadataLoaded = () => {
        if (!isNaN(audioRef.current!.duration)) {
          setFallbackDuration(audioRef.current!.duration);
        }
      };
      audioRef.current.addEventListener('loadedmetadata', handleMetadataLoaded);
      return () => {
        audioRef.current?.removeEventListener('loadedmetadata', handleMetadataLoaded);
      };
    }
  }, [audioFile]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Keyboard shortcuts
  useEffect(() => {
    let lastZoomTime = 0;
    const ZOOM_KEY_THROTTLE = 100;

    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      // If typing in an input (or contenteditable), skip
      const target = event.target as HTMLElement;
      // FIX: cast to HTMLElement to access isContentEditable
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        (target as HTMLElement).isContentEditable ||
        target.closest('.MuiInputBase-root') ||
        target.closest('[role="textbox"]') ||
        target.closest('.MuiTextField-root') ||
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        (document.activeElement as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }

      if (event.key === 's') {
        event.preventDefault();
        togglePlayPause();
      } else if (event.key === 'f' || event.key === 'g') {
        if (audioRef.current) {
          const time = audioRef.current.currentTime;
          const timeStr = time.toFixed(4);
          setTimestampsSafe((prev) => {
            const isDuplicate = prev.some((t) => t.time === timeStr);
            if (!isDuplicate) {
              const newTimestamp: Timestamp = {
                id: generateUniqueId(),
                time: timeStr,
                image: null
              };
              setSelectedTimestamp(newTimestamp.id);
              return [...prev, newTimestamp].sort(
                (a, b) => parseFloat(a.time) - parseFloat(b.time)
              );
            }
            return prev;
          });
        }
      } else if (event.key === 'd') {
        if (selectedTimestamp) {
          const tsToDelete = timestamps.find((t) => t.id === selectedTimestamp);
          if (tsToDelete) {
            setLastDeletedTimestamp(tsToDelete);
            setTimestampsSafe((prev) =>
              prev.filter((t) => t.id !== selectedTimestamp)
            );
            setSelectedTimestamp(null);
          }
        }
      } else if (event.key === 'u') {
        if (lastDeletedTimestamp) {
          setTimestampsSafe((prev) => {
            const restored = [...prev, lastDeletedTimestamp].sort(
              (a, b) => parseFloat(a.time) - parseFloat(b.time)
            );
            return restored;
          });
          setSelectedTimestamp(lastDeletedTimestamp.id);
          setLastDeletedTimestamp(null);
        }
      } else if (event.key === '1') {
        event.preventDefault();
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          setSmoothCurrentTime(0);
          setLastHitColor(null);
          lastManualSeekRef.current = performance.now();
          lastFrameTimeRef.current = 0;
        }
      } else if (event.key === '4') {
        event.preventDefault();
        if (audioRef.current) {
          const duration = audioRef.current.duration || 0;
          audioRef.current.currentTime = duration;
          setSmoothCurrentTime(duration);
          setLastHitColor(null);
          lastManualSeekRef.current = performance.now();
          lastFrameTimeRef.current = duration;
          audioRef.current.pause();
          setIsPlaying(false);
        }
      } else if (event.key === 'e' || event.key === 'r') {
        event.preventDefault();
        const now = Date.now();
        if (now - lastZoomTime < ZOOM_KEY_THROTTLE) return;
        lastZoomTime = now;
        if (event.key === 'e') {
          handleZoom('out');
        } else {
          handleZoom('in');
        }
      } else if (event.key === 'q' || event.key === 'w') {
        event.preventDefault();
        if (audioRef.current) {
          const newRate =
            event.key === 'q'
              ? Math.max(0.25, playbackRate - 0.25)
              : Math.min(2, playbackRate + 0.25);
          setPlaybackRate(newRate);
        }
      } else if (event.key === 'Tab') {
        event.preventDefault();
        if (audioRef.current) {
          const newTime = Math.max(0, audioRef.current.currentTime - 0.33);
          audioRef.current.currentTime = newTime;
          setSmoothCurrentTime(newTime);
          setLastHitColor(null);
        }
      } else if (event.key === 't') {
        event.preventDefault();
        if (audioRef.current) {
          const dur = audioRef.current.duration || 0;
          const newTime = Math.min(dur, audioRef.current.currentTime + 0.33);
          audioRef.current.currentTime = newTime;
          setSmoothCurrentTime(newTime);
          setLastHitColor(null);
        }
      } else if (event.key === '2' || event.key === '3') {
        event.preventDefault();
        if (audioRef.current) {
          const now = Date.now();
          const sortedTimestamps = [...timestamps].sort(
            (a, b) => parseFloat(a.time) - parseFloat(b.time)
          );
          const currentT = smoothCurrentTime;
          const audio = audioRef.current;
          const wasPlaying = isPlaying;

          if (event.key === '2') {
            const prevStamp = sortedTimestamps
              .slice()
              .reverse()
              .find((t) => {
                const st = parseFloat(t.time);
                const lastVisited = recentlyVisitedTimestampsRef.current.get(t.id);
                const isRecentlyVisited =
                  lastVisited && now - lastVisited < TIMESTAMP_COOLDOWN;
                return st <= currentT && Math.abs(st - currentT) > 0.01 && !isRecentlyVisited;
              });
            if (prevStamp) {
              const newTime = parseFloat(prevStamp.time);
              recentlyVisitedTimestampsRef.current.set(prevStamp.id, now);
              audio.currentTime = newTime;
              setSmoothCurrentTime(newTime);
              setSelectedTimestamp(prevStamp.id);
              setLastHitColor(null);
              lastManualSeekRef.current = now;
              lastFrameTimeRef.current = newTime;
            } else if (currentT > 0) {
              audio.currentTime = 0;
              setSmoothCurrentTime(0);
              setSelectedTimestamp(null);
              setLastHitColor(null);
              lastManualSeekRef.current = now;
              lastFrameTimeRef.current = 0;
            }
          } else {
            const nextStamp = sortedTimestamps.find((t) => {
              const st = parseFloat(t.time);
              const lastVisited = recentlyVisitedTimestampsRef.current.get(t.id);
              const isRecentlyVisited =
                lastVisited && now - lastVisited < TIMESTAMP_COOLDOWN;
              return st >= currentT && Math.abs(st - currentT) > 0.01 && !isRecentlyVisited;
            });

            if (nextStamp) {
              const newTime = parseFloat(nextStamp.time);
              recentlyVisitedTimestampsRef.current.set(nextStamp.id, now);
              audio.currentTime = newTime;
              setSmoothCurrentTime(newTime);
              setSelectedTimestamp(nextStamp.id);
              setLastHitColor(null);
              lastManualSeekRef.current = now;
              lastFrameTimeRef.current = newTime;
            } else {
              const duration = audio.duration || 0;
              audio.currentTime = duration;
              setSmoothCurrentTime(duration);
              setSelectedTimestamp(null);
              setLastHitColor(null);
              lastManualSeekRef.current = now;
              lastFrameTimeRef.current = duration;
            }
          }
          if (wasPlaying && audio.paused) {
            audio.play();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [
    isPlaying,
    playbackRate,
    timestamps,
    smoothCurrentTime,
    selectedTimestamp,
    lastDeletedTimestamp,
    handleZoom
  ]);

  // --------------------- SCROLL / ZOOM --------------------
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // e.currentTarget here is never null, but the lint complains about possible null if we used .current
    const container = e.currentTarget;
    const scrollLeft = container.scrollLeft;
    const maxScroll = container.scrollWidth - container.clientWidth;
    setIsAtLeftEdge(Math.abs(scrollLeft) < 1);
    setIsAtRightEdge(Math.abs(maxScroll - scrollLeft) < 1);
  };

  useLayoutEffect(() => {
    if (!timelineRef.current || !audioRef.current) return;
    const timeline = timelineRef.current;
    const container = timeline.parentElement;
    if (!container) return; // FIX: container possibly null
    const duration = audioRef.current.duration || 1;

    if (zoom > 1 && !isZoomingRef.current && !isImageDraggingOver && !dragState.isDragging) {
      const timelineWidth = timeline.offsetWidth;
      const containerWidth = container.offsetWidth;
      const playheadPixels = (smoothCurrentTime / duration) * timelineWidth;
      const targetScrollLeft = Math.max(0, playheadPixels - containerWidth / 2);
      const maxScroll = Math.max(0, timelineWidth - containerWidth);
      const finalScrollLeft = Math.min(targetScrollLeft, maxScroll);

      if (!isPlaying) {
        container.style.scrollBehavior = 'smooth';
        requestAnimationFrame(() => {
          container.scrollLeft = finalScrollLeft;
          setTimeout(() => {
            container.style.scrollBehavior = 'auto';
          }, 300);
        });
      } else {
        // If playing, do mild "lerp"
        const currentScroll = container.scrollLeft;
        const scrollDiff = finalScrollLeft - currentScroll;
        if (Math.abs(scrollDiff) > 1) {
          const lerpFactor = 0.1;
          const newScrollLeft = currentScroll + scrollDiff * lerpFactor;
          container.style.scrollBehavior = 'auto';
          container.scrollLeft = newScrollLeft;
        }
      }
    }
  }, [zoom, smoothCurrentTime, isPlaying, isImageDraggingOver, dragState.isDragging]);

  // --------------------- DRAG & DROP TIMELINE -------------
  const dragStateRef = useRef<DragState & { scrollDirectionTimeout?: any }>({
    isDragging: false,
    draggedTimestamp: null,
    mousePosition: null,
    draggedOver: null,
    isImageDraggingOver: false,
    lastUpdateTime: 0,
    lastMousePosition: null,
    rafId: undefined,
    isDraggingValid: false
  } as DragState);

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !timelineRef.current) return;
    if (e.target instanceof HTMLElement && e.target.closest('.timestamp-marker')) {
      return;
    }

    const rect = timelineRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const percentageAcross = (mouseX / rect.width) * 100;
    const boundedPercentage = Math.max(0, Math.min(100, percentageAcross));
    const duration = audioRef.current.duration;
    const targetTime = (boundedPercentage / 100) * duration;

    if (targetTime >= 0 && targetTime <= duration) {
      dispatch({
        type: 'UPDATE_DRAG',
        payload: {
          position: boundedPercentage,
          draggedOver: undefined,  // Changed from null
          isImageDraggingOver: false
        }
      });
      const safeTime = targetTime < 0.1 ? 0 : targetTime;
      audioRef.current.currentTime = safeTime;
      setSmoothCurrentTime(safeTime);
    }
  };

  const handleTimelineDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    if (e.target instanceof HTMLElement && e.target.closest('.timestamp-marker')) {
      return;
    }
    if (zoom <= 1) {
      handleTimelineMouseDown(e);
      return;
    }
    if (
      e.target instanceof HTMLElement &&
      e.target.getAttribute('draggable') === 'true'
    ) {
      dispatch({
        type: 'START_DRAG',
        payload: {
          id: e.target instanceof HTMLElement
            ? e.target.dataset.stampId
            : undefined,
          position: undefined  // Changed from null
        }
      });
    }
    document.addEventListener('mouseup', handleTimelineDragEnd);
  };

  const handleTimelineDragEnd = (_e: MouseEvent) => {
    // Not used for timeline dragging end in code
  };

  const handleTimelineDragEnter = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!timelineRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      // FIX: cast the items array to DataTransferItem[]
      const items = Array.from(e.dataTransfer.items || []) as DataTransferItem[];
      const hasFile = items.some(
        (item) => item?.kind === 'file' && item.type.startsWith('image/')
      );
      const hasUrl = e.dataTransfer.types.includes('text/plain');

      const isValidDrag = hasFile || hasUrl;
      if (isValidDrag) {
        dragStateRef.current.isDraggingValid = true;
        const timelineRect = timelineRef.current.getBoundingClientRect();
        const mouseX = e.clientX - timelineRect.left;
        const percentageAcross = (mouseX / timelineRect.width) * 100;
        const boundedPercentage = Math.max(0, Math.min(100, percentageAcross));

        unstable_batchedUpdates(() => {
          setIsImageDraggingOver(true);
          dispatch({
            type: 'UPDATE_DRAG',
            payload: {
              position: boundedPercentage,
              draggedOver: 'timeline',
              isImageDraggingOver: true
            }
          });
        });
      }
    },
    [dragState.mousePosition]
  );

  const updateDragVisuals = useCallback(() => {
    if (!dragStateRef.current.lastMousePosition) return;

    const { mouseX, timelineRect } = dragStateRef.current.lastMousePosition;
    const timelineX = mouseX - timelineRect.left;
    const percentageAcross = (timelineX / timelineRect.width) * 100;
    const boundedPercentage = Math.max(0, Math.min(100, percentageAcross));

    unstable_batchedUpdates(() => {
      setIsImageDraggingOver(true);
      dispatch({
        type: 'UPDATE_DRAG',
        payload: {
          position: boundedPercentage,
          draggedOver: 'timeline',
          isImageDraggingOver: true
        }
      });
    });

    if (dragStateRef.current.isDraggingValid) {
      dragStateRef.current.rafId = requestAnimationFrame(updateDragVisuals);
    }
  }, []);

  const cleanupDragState = useCallback(() => {
    if (dragStateRef.current.rafId) {
      cancelAnimationFrame(dragStateRef.current.rafId);
      dragStateRef.current.rafId = undefined;
    }
    if (dragStateRef.current.scrollDirectionTimeout) {
      clearTimeout(dragStateRef.current.scrollDirectionTimeout);
    }
    dragStateRef.current.isDraggingValid = false;
    dragStateRef.current.lastMousePosition = null;

    unstable_batchedUpdates(() => {
      setIsImageDraggingOver(false);
      dispatch({
        type: 'UPDATE_DRAG',
        payload: {
          position: undefined,  // Changed from null
          draggedOver: undefined,  // Changed from null
          isImageDraggingOver: false
        }
      });
      setAutoScrollDirection(null);
    });

    if (isPlaying && zoom > 1 && audioRef.current && !animationFrameRef.current) {
      lastFrameTimeRef.current = performance.now();
      lastActualTimeRef.current = audioRef.current.currentTime;
      animationFrameRef.current = requestAnimationFrame(updateSmoothPlayhead);
    }
  }, [isPlaying, zoom, updateSmoothPlayhead]);

  const debouncedSetAutoScrollDirection = useCallback((direction: string | null) => {
    if (dragStateRef.current.scrollDirectionTimeout) {
      clearTimeout(dragStateRef.current.scrollDirectionTimeout);
    }
    dragStateRef.current.scrollDirectionTimeout = setTimeout(() => {
      setAutoScrollDirection(direction);
    }, 100);
  }, []);

  const handleTimelineDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (!dragStateRef.current.isDraggingValid) {
        const items = Array.from(e.dataTransfer.items || []) as DataTransferItem[];
        const hasFile =
          items.some((item) => item?.kind === 'file' && item.type.startsWith('image/'));
        const hasUrl = e.dataTransfer.types.includes('text/plain');
        const isValidDrag = hasFile || hasUrl;

        if (isValidDrag) {
          dragStateRef.current.isDraggingValid = true;
          setIsImageDraggingOver(true);
        }
      }
      if (!timelineRef.current || !dragStateRef.current.isDraggingValid) return;
      const container = containerRef.current;
      if (!container) return; // FIX
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      if (zoom > 1) {
        if (!isAtLeftEdge && mouseX < SCROLL_THRESHOLD) {
          debouncedSetAutoScrollDirection('left');
        } else if (!isAtRightEdge && mouseX > rect.width - SCROLL_THRESHOLD) {
          debouncedSetAutoScrollDirection('right');
        } else {
          debouncedSetAutoScrollDirection(null);
        }
      }

      const timelineRect = timelineRef.current.getBoundingClientRect();
      dragStateRef.current.lastMousePosition = {
        mouseX: e.clientX,
        timelineRect
      };

      const timelineX = e.clientX - timelineRect.left;
      const percentageAcross = (timelineX / timelineRect.width) * 100;
      const boundedPercentage = Math.max(0, Math.min(100, percentageAcross));

      // Check if we are in the deadzone
      const isInLeftDeadzone = !isAtLeftEdge && mouseX < DEADZONE_WIDTH;
      const isInRightDeadzone =
        !isAtRightEdge && mouseX > rect.width - DEADZONE_WIDTH;

      if (!isInLeftDeadzone && !isInRightDeadzone) {
        dispatch({
          type: 'UPDATE_DRAG',
          payload: {
            position: boundedPercentage,
            draggedOver: 'timeline',
            isImageDraggingOver: true
          }
        });
        if (!dragStateRef.current.rafId) {
          dragStateRef.current.rafId = requestAnimationFrame(updateDragVisuals);
        }
      }
    },
    [
      zoom,
      isAtLeftEdge,
      isAtRightEdge,
      SCROLL_THRESHOLD,
      debouncedSetAutoScrollDirection,
      updateDragVisuals
    ]
  );

  useEffect(() => {
    if (autoScrollDirection && containerRef.current && zoom > 1) {
      const container = containerRef.current;
      let currentSpeed = 0;
      let lastTime = performance.now();

      const scrollInterval = setInterval(() => {
        const now = performance.now();
        const deltaTime = (now - lastTime) / 16;
        lastTime = now;

        const maxSpeed = SCROLL_SPEED * 3;
        const acceleration = SCROLL_ACCELERATION * 2;

        const isAtLeft = container.scrollLeft === 0;
        const isAtRight =
          container.scrollLeft + container.clientWidth >= container.scrollWidth;

        const rect = container.getBoundingClientRect();
        const mouseX = dragStateRef.current.lastMousePosition?.mouseX || 0;
        const relativeX = mouseX - rect.left;
        const distanceFromEdge =
          autoScrollDirection === 'left' ? relativeX : rect.width - relativeX;
        const edgeBoost = distanceFromEdge < DEADZONE_WIDTH / 2 ? 2 : 1;

        currentSpeed = Math.min(
          maxSpeed,
          currentSpeed + acceleration * deltaTime * edgeBoost
        );

        if (autoScrollDirection === 'left' && !isAtLeft) {
          const newScrollLeft = Math.max(0, container.scrollLeft - currentSpeed);
          container.scrollLeft = newScrollLeft;
          if (newScrollLeft === 0) {
            setAutoScrollDirection(null);
          }
        } else if (autoScrollDirection === 'right' && !isAtRight) {
          const maxScroll = container.scrollWidth - container.clientWidth;
          const newScrollLeft = Math.min(
            maxScroll,
            container.scrollLeft + currentSpeed
          );
          container.scrollLeft = newScrollLeft;
          if (newScrollLeft >= maxScroll) {
            setAutoScrollDirection(null);
          }
        }
      }, 16);

      return () => {
        clearInterval(scrollInterval);
      };
    }
  }, [autoScrollDirection, zoom]);

  const handleTimelineDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (zoom > 1) {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        if (mouseX >= DEADZONE_WIDTH && mouseX <= rect.width - DEADZONE_WIDTH) {
          setAutoScrollDirection(null);
          setScrollSpeed(0);
        }
      }
      const { clientX, clientY } = e;
      if (!timelineRef.current) return;
      const timelineRect = timelineRef.current.getBoundingClientRect();
      if (
        clientX < timelineRect.left ||
        clientX > timelineRect.right ||
        clientY < timelineRect.top ||
        clientY > timelineRect.bottom
      ) {
        cleanupDragState();
        setScrollSpeed(0);
      }
    },
    [zoom, cleanupDragState]
  );

  const handleDropOnTimelineOrStamp = useCallback(
    async (
      e: React.DragEvent<HTMLDivElement> | any,
      { targetStampId = null }: { targetStampId: string | null }
    ) => {
      if (!timelineRef.current || !audioRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      // FIX: cast to DataTransferItem[]
      const items = Array.from(e.dataTransfer?.items || []) as DataTransferItem[];
      let file: File | null = null;
      let droppedUrl: string | null = null;
      const fileItem = items.find(
        (item) => item?.kind === 'file' && item.type.startsWith('image/')
      );
      if (fileItem) {
        file = fileItem.getAsFile();
      } else {
        const plainUrl = e.dataTransfer?.getData('text/plain');
        if (
          plainUrl &&
          typeof plainUrl === 'string' &&
          !plainUrl.includes('existingItem')
        ) {
          droppedUrl = plainUrl;
        }
      }

      let existingItemData: { type: string; stampId: string } | null = null;
      try {
        const maybeJson = e.dataTransfer?.getData('text/plain');
        if (maybeJson && !file && !droppedUrl) {
          const parsed = JSON.parse(maybeJson);
          if (parsed?.type === 'existingItem') {
            existingItemData = parsed;
          }
        }
      } catch {
        // Not JSON or not an existing item
      }

      let newStampId = targetStampId;
      const duration = audioRef.current.duration || 1;
      const rect = timelineRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const percentageAcross = (mouseX / rect.width) * 100;
      const boundedPercent = Math.max(0, Math.min(100, percentageAcross)) / 100;
      const newTimeFloat = parseFloat((boundedPercent * duration).toFixed(4));

      if (existingItemData) {
        newStampId = existingItemData.stampId;
        setTimestampsSafe((prev) => {
          const existingStamp = prev.find((s) => s.id === newStampId);
          if (!existingStamp) return prev;
          const updated = prev.map((s) =>
            s.id === newStampId
              ? { ...existingStamp, time: newTimeFloat.toString() }
              : s
          );
          return [...updated].sort((a, b) => parseFloat(a.time) - parseFloat(b.time));
        });
        setSelectedTimestamp(existingItemData.stampId);
      } else {
        if (!targetStampId) {
          const freshStampId = generateUniqueId();
          newStampId = freshStampId;
          const newStamp: Timestamp = {
            id: freshStampId,
            time: newTimeFloat.toString(),
            image: null
          };
          setTimestampsSafe((prev) =>
            [...prev, newStamp].sort((a, b) => parseFloat(a.time) - parseFloat(b.time))
          );
          setSelectedTimestamp(freshStampId);
        }
      }

      if (!isPlaying && audioRef.current) {
        audioRef.current.currentTime = newTimeFloat;
        setSmoothCurrentTime(newTimeFloat);
        setLastHitColor(null);
        lastManualSeekRef.current = performance.now();
        lastFrameTimeRef.current = newTimeFloat;
      }

      if (newStampId) {
        if (file) {
          await handleImageDrop(file, e, newStampId);
        } else if (typeof droppedUrl === 'string') {
          await handleImageDrop(droppedUrl, e, newStampId);
        }
      }
    },
    [isPlaying, handleImageDrop, setTimestampsSafe, generateUniqueId]
  );

  const handleTimelineDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      cleanupDragState();
      if (!timelineRef.current) return;

      const container = containerRef.current;
      const timeline = timelineRef.current;
      if (!container || !timeline) return; // FIX
      const containerRect = container.getBoundingClientRect();
      const timelineRect = timeline.getBoundingClientRect();
      const scrollOffset = container.scrollLeft;

      const mouseX = e.clientX - timelineRect.left + scrollOffset;
      const mouseXRelativeToContainer = e.clientX - containerRect.left;

      if (zoom > 1) {
        const isAtLeft = container.scrollLeft === 0;
        const isAtRight =
          container.scrollLeft + container.clientWidth >= container.scrollWidth;

        const isInLeftDeadzone =
          mouseXRelativeToContainer < DEADZONE_WIDTH && !isAtLeft;
        const isInRightDeadzone =
          mouseXRelativeToContainer > containerRect.width - DEADZONE_WIDTH && !isAtRight;

        if (isInLeftDeadzone || isInRightDeadzone) {
          return;
        }
      }

      try {
        await handleDropOnTimelineOrStamp(e, { targetStampId: null });
      } catch (error) {
        console.error('Error handling timeline drop:', error);
      } finally {
        if (zoom > 1 && isPlaying) {
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
          }
          lastFrameTimeRef.current = performance.now();
          lastActualTimeRef.current = audioRef.current?.currentTime || 0;
          animationFrameRef.current = requestAnimationFrame(updateSmoothPlayhead);
        }
      }
    },
    [
      zoom,
      isPlaying,
      cleanupDragState,
      handleDropOnTimelineOrStamp,
      updateSmoothPlayhead
    ]
  );

  const handleTimestampDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>, stampId: string) => {
      e.preventDefault();
      e.stopPropagation();

      cleanupDragState();
      (e as any).targetStampId = stampId;
      try {
        await handleDropOnTimelineOrStamp(e, { targetStampId: stampId });
      } finally {
        if (zoom > 1 && isPlaying) {
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
          }
          lastFrameTimeRef.current = performance.now();
          lastActualTimeRef.current = audioRef.current?.currentTime || 0;
          animationFrameRef.current = requestAnimationFrame(updateSmoothPlayhead);
        }
      }
    },
    [
      zoom,
      isPlaying,
      cleanupDragState,
      handleDropOnTimelineOrStamp,
      updateSmoothPlayhead
    ]
  );

  const DeadzoneBlocker: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
    if ((side === 'left' && isAtLeftEdge) || (side === 'right' && isAtRightEdge) || zoom <= 1) {
      return null;
    }
    return (
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          [side]: 0,
          width: `${DEADZONE_WIDTH}px`,
          background: 'transparent',
          zIndex: 100000,
          pointerEvents: dragState.isDragging || isImageDraggingOver ? 'all' : 'none'
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (zoom > 1) {
            dragStateRef.current.lastMousePosition = {
              mouseX: e.clientX,
              timelineRect: timelineRef.current?.getBoundingClientRect() as DOMRect
            };
            setAutoScrollDirection(side === 'left' ? 'left' : 'right');
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (zoom > 1) {
            dragStateRef.current.lastMousePosition = {
              mouseX: e.clientX,
              timelineRect: timelineRef.current?.getBoundingClientRect() as DOMRect
            };
            setAutoScrollDirection(side === 'left' ? 'left' : 'right');
          }
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const mouseX = side === 'left'
            ? e.clientX - rect.left
            : rect.right - e.clientX;
          if (mouseX > DEADZONE_WIDTH) {
            setAutoScrollDirection(null);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAutoScrollDirection(null);
        }}
      />
    );
  };

  const DeadzoneLeft: React.FC = () => (
    zoom > 1 ? (
      <>
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${DEADZONE_WIDTH}px`,
            height: '100%',
            background: dragState.isDragging
              ? 'linear-gradient(90deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 100%)'
              : 'transparent',
            zIndex: 99999,
            pointerEvents: 'none'
          }}
        />
        {dragState.isDragging && <DeadzoneBlocker side="left" />}
      </>
    ) : null
  );

  const DeadzoneRight: React.FC = () => (
    zoom > 1 ? (
      <>
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: `${DEADZONE_WIDTH}px`,
            height: '100%',
            background: dragState.isDragging
              ? 'linear-gradient(-90deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 100%)'
              : 'transparent',
            zIndex: 99999,
            pointerEvents: 'none'
          }}
        />
        {dragState.isDragging && <DeadzoneBlocker side="right" />}
      </>
    ) : null
  );

  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mousePercentage = (mouseX / rect.width) * 100;
    const boundedPercentage = Math.max(0, Math.min(100, mousePercentage));
    dispatch({
      type: 'UPDATE_DRAG',
      payload: {
        position: boundedPercentage,
        draggedOver: dragState.draggedOver || undefined,  // Handle null case
        isImageDraggingOver: dragState.isImageDraggingOver
      }
    });
  };

  const handleSelection = (stampId: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (isHandlingUploadRef.current) return;
    if (dragState.isDragging) return;
    if (
      e.target instanceof HTMLElement &&
      (e.target.closest('.image-upload-button') ||
        e.target.closest('[data-upload-container]'))
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setSelectedTimestamp(stampId === selectedTimestamp ? null : stampId);

    if (!isPlaying && stampId) {
      const found = timestamps.find((t) => t.id === stampId);
      if (found && audioRef.current) {
        const newTime = parseFloat(found.time);
        audioRef.current.currentTime = newTime;
        setSmoothCurrentTime(newTime);
        setLastHitColor(null);
        lastManualSeekRef.current = performance.now();
        lastFrameTimeRef.current = newTime;
        setTimeout(() => {
          lastManualSeekRef.current = undefined;
          if (timelineRef.current?.parentElement) {
            const container = timelineRef.current.parentElement;
            if (!container) return;
            const timelineWidth = timelineRef.current.offsetWidth;
            const containerWidth = container.offsetWidth;
            const playheadPixels =
              (newTime / (audioRef.current?.duration || 1)) * timelineWidth;
            const targetScrollLeft = Math.max(0, playheadPixels - containerWidth / 2);
            const maxScroll = Math.max(0, timelineWidth - containerWidth);
            const finalScrollLeft = Math.min(targetScrollLeft, maxScroll);
            container.style.scrollBehavior = 'smooth';
            container.scrollLeft = finalScrollLeft;
            setTimeout(() => {
              container.style.scrollBehavior = 'auto';
            }, 300);
          }
        }, 50);
      }
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isHandlingUploadRef.current) return;
    if (!(e.target instanceof HTMLElement && e.target.closest('.timestamp-marker'))) {
      handleTimelineMouseDown(e);
    }
  };

  const getVisibleTimestamps = useCallback(() => {
    const container = timelineRef.current?.parentElement;
    const timeline = timelineRef.current;
    if (!container || !timeline || !audioRef.current) return timestamps;

    const viewportStartPx = container.scrollLeft;
    const viewportEndPx = viewportStartPx + container.offsetWidth;
    const timelineWidth = timeline.offsetWidth / zoom;
    const padding = container.offsetWidth * 3;

    return timestamps.filter((t) => {
      const px = (parseFloat(t.time) / (audioRef.current!.duration || 1)) * timelineWidth;
      return px >= viewportStartPx / zoom - padding && px <= viewportEndPx / zoom + padding;
    });
  }, [timestamps, zoom]);

  const [visibleTimestamps, setVisibleTimestamps] = useState<Timestamp[]>(getVisibleTimestamps());

  useEffect(() => {
    const container = timelineRef.current?.parentElement;
    if (!container) return;

    const updateVisibleTimestamps = () => {
      setVisibleTimestamps(getVisibleTimestamps());
    };
    updateVisibleTimestamps();
    container.addEventListener('scroll', updateVisibleTimestamps);
    return () => {
      container.removeEventListener('scroll', updateVisibleTimestamps);
    };
  }, [getVisibleTimestamps, zoom]);

  const handleSizeChange = (
    _event: React.MouseEvent<HTMLElement>,
    newSize: keyof TimelineSizes
  ) => {
    if (newSize !== null) {
      setImageSize(newSize);
    }
  };

  // Insert after the useEffect that sets up the scroll listener for visibleTimestamps

  useEffect(() => {
    setVisibleTimestamps(getVisibleTimestamps());
  }, [fallbackDuration]);

  // --------------------- RENDER --------------------------
  return (
    <Card
      sx={{
        width: '100%',
        maxWidth: `${TIMELINE_SIZES[imageSize].width}px`,
        minWidth: `${TIMELINE_SIZES[imageSize].width}px`,
        minHeight: '140px',
        bgcolor: 'background.paper',
        color: 'text.primary',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      <CardContent>
        <Box
          className="timeline-container"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            width: '100%'
          }}
        >
          {/* AUDIO FILE SELECT/UPLOAD */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <input
              ref={audioFileInputRef}
              type="file"
              accept={fileTypeToAccept.audio}
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              id="audio-file-input"
            />
            <label htmlFor="audio-file-input">
              <Button
                variant="contained"
                component="span"
                sx={{
                  bgcolor: '#2A2A2A',
                  color: '#FFFFFF',
                  '&:hover': {
                    bgcolor: '#3A3A3A'
                  }
                }}
              >
                {audioFile ? 'CHANGE FILE' : 'CHOOSE FILE'}
              </Button>
            </label>
            {audioFileName && (
              <Typography
                variant="body2"
                sx={{
                  color: '#999999',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '300px'
                }}
              >
                {audioFileName}
              </Typography>
            )}
          </Box>
          {fileError && (
            <Typography variant="caption" color="error">
              {fileError}
            </Typography>
          )}

          {audioFile && (
            <>
              <audio
                key={audioFile}
                ref={audioRef}
                src={audioFile}
                preload="metadata"
                onEnded={() => setIsPlaying(false)}
              />

              {/* TIMELINE CONTROLS */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    width: '100%'
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <IconButton
                      onClick={() => {
                        if (audioRef.current) {
                          const wasPlaying = isPlaying;
                          audioRef.current.currentTime = 0;
                          setSmoothCurrentTime(0);
                          setLastHitColor(null);
                          lastManualSeekRef.current = performance.now();
                          lastFrameTimeRef.current = 0;
                          if (wasPlaying && audioRef.current.paused) {
                            audioRef.current.play();
                          }
                        }
                      }}
                      sx={{
                        p: 1,
                        bgcolor: '#333333',
                        color: '#FFA500',
                        '&:hover': {
                          bgcolor: '#444444'
                        }
                      }}
                    >
                      <SkipPreviousIcon sx={{ fontSize: 20 }} />
                    </IconButton>

                    <Button
                      variant="contained"
                      onClick={togglePlayPause}
                      startIcon={isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
                      sx={{
                        px: 3,
                        py: 1,
                        bgcolor: '#FFA500',
                        '&:hover': {
                          bgcolor: '#FF8C00'
                        }
                      }}
                    >
                      {isPlaying ? 'Pause' : 'Play'}
                    </Button>

                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        width: '200px'
                      }}
                    >
                      <Slider
                        value={playbackRate}
                        min={0}
                        max={2}
                        step={0.01}
                        onChange={(e) =>
                          setPlaybackRate(parseFloat((e.target as HTMLInputElement).value))
                        }
                        sx={{
                          width: '140px',
                          color: '#FFA500',
                          '& .MuiSlider-thumb': {
                            '&:hover, &.Mui-focusVisible': {
                              boxShadow: '0 0 0 8px rgba(255, 165, 0, 0.16)'
                            }
                          },
                          '& .MuiSlider-rail': {
                            opacity: 0.28
                          }
                        }}
                      />
                      <Typography
                        variant="body2"
                        sx={{
                          width: '52px',
                          color: '#FFA500',
                          ml: 1
                        }}
                      >
                        {playbackRate.toFixed(2)}x
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <IconButton
                        onClick={() => handleZoom('out')}
                        sx={{
                          p: 1,
                          bgcolor: '#333333',
                          color: '#FFA500',
                          '&:hover': {
                            bgcolor: '#444444'
                          }
                        }}
                      >
                        <ZoomOutIcon sx={{ fontSize: 20 }} />
                      </IconButton>
                      <IconButton
                        onClick={() => handleZoom('in')}
                        sx={{
                          p: 1,
                          bgcolor: '#333333',
                          color: '#FFA500',
                          '&:hover': {
                            bgcolor: '#444444'
                          }
                        }}
                      >
                        <ZoomInIcon sx={{ fontSize: 20 }} />
                      </IconButton>
                    </Box>
                  </Box>

                  <Tooltip
                    title={
                      <Box sx={{ p: 1, fontSize: '0.875rem' }}>
                        <Typography
                          variant="subtitle2"
                          sx={{ fontWeight: 'bold', mb: 1 }}
                        >
                          Keyboard Shortcuts
                        </Typography>
                        <Box component="ul" sx={{ m: 0, pl: 2 }}>
                          <li>Space/S - Play/Pause</li>
                          <li>F/G - Add timestamp</li>
                          <li>Q/W - Decrease/Increase speed</li>
                          <li>E/R - Zoom out/in</li>
                          <li>1 - Jump to start</li>
                          <li>2/3 - Previous/next timestamp</li>
                          <li>4 - Jump to end</li>
                          <li>Tab/T - Scrub backward/forward</li>
                          <li>D - Delete selected</li>
                          <li>U - Undo last deleted</li>
                        </Box>
                      </Box>
                    }
                    arrow
                    placement="left"
                  >
                    <IconButton
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
                </Box>

                {/* TIMELINE ITSELF */}
                <Box sx={{ position: 'relative' }}>
                  <Box
                    ref={containerRef}
                    sx={{
                      overflowX: zoom > 1 ? 'auto' : 'hidden',
                      borderRadius: 1,
                      '&::-webkit-scrollbar': {
                        height: '10px',
                        display: zoom > 1 ? 'block' : 'none'
                      },
                      '&::-webkit-scrollbar-track': {
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        borderRadius: '5px'
                      },
                      '&::-webkit-scrollbar-thumb': {
                        backgroundColor: 'rgba(255,165,0,0.5)',
                        borderRadius: '5px',
                        '&:hover': {
                          backgroundColor: 'rgba(255,165,0,0.7)'
                        }
                      },
                      scrollBehavior: 'smooth'
                    }}
                    onScroll={handleScroll}
                  >
                    <Box
                      ref={timelineRef}
                      className="nodrag"
                      sx={{
                        position: 'relative',
                        height: `${TIMELINE_SIZES[imageSize].height}px`,
                        bgcolor: (theme) => theme.palette.background.paper,
                        width: zoom <= 1 ? '100%' : `${zoom * 100}%`,
                        minWidth: '100%',
                        border: (theme) => `1px solid rgba(0, 0, 0, 0.2)`,
                        cursor: zoom > 1 ? 'grab' : 'pointer',
                        userSelect: 'none',
                        willChange: 'width, transform',
                        transform: 'translateZ(0)',
                        '&:hover .hover-button': {
                          opacity: 1
                        }
                      }}
                      data-drag-target="true"
                      onDragEnter={handleTimelineDragEnter}
                      onDragOver={handleTimelineDragOver}
                      onDragLeave={handleTimelineDragLeave}
                      onDrop={handleTimelineDrop}
                      onMouseMove={handleTimelineMouseMove}
                      onClick={handleTimelineClick}
                      onMouseDown={handleTimelineDragStart}
                    >
                      <DeadzoneLeft />
                      <DeadzoneRight />

                      <DragIndicator
                        dragState={dragState}
                        imageSize={imageSize}
                        isImageDraggingOver={isImageDraggingOver}
                      />

                      {dragState.draggedOver === 'timeline' &&
                        dragState.mousePosition !== null &&
                        isImageDraggingOver && (
                          <Box
                            sx={{
                              position: 'absolute',
                              top: '0',
                              bottom: '0',
                              width: '2px',
                              backgroundColor: 'rgba(255, 165, 0, 0.5)',
                              zIndex: 99998,
                              transform: 'translateX(-50%)',
                              left: `${dragState.mousePosition}%`,
                              pointerEvents: 'none',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              opacity: dragState.mousePosition === null ? 0 : 1,
                              '& > div': {
                                width: `${TIMELINE_SIZES[imageSize].imageSize}px`,
                                height: `${TIMELINE_SIZES[imageSize].imageSize * 1.5}px`,
                                border: '2px solid rgba(255, 165, 0, 0.5)',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(255, 165, 0, 0.1)',
                                marginTop: `${TIMELINE_SIZES[imageSize].imageSize * 0.3}px`
                              }
                            }}
                          >
                            <div />
                          </Box>
                        )}

                      <Box
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          height: '8px',
                          zIndex: 1,
                          bgcolor: lastHitColor || 'transparent',
                          transition: 'background-color 0.1s',
                          opacity: lastHitColor ? 1 : 0,
                          pointerEvents: 'none'
                        }}
                      />
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          bgcolor: 'background.paper',
                          zIndex: 0
                        }}
                      />

                      {/* Button for adding a timestamp via direct click */}
                      <Button
                        className="hover-button"
                        variant="contained"
                        size="small"
                        sx={{
                          position: 'absolute',
                          left: `${dragState.mousePosition ?? 50}%`,
                          transform: 'translateX(-50%)',
                          top: '0px',
                          height: '14px',
                          width: '14px',
                          minWidth: '14px',
                          zIndex: 1,
                          opacity: 0,
                          transition: 'opacity 0.2s',
                          bgcolor: 'rgba(255, 165, 0, 0.4)',
                          color: 'white',
                          padding: 0,
                          minHeight: 0,
                          fontSize: '12px',
                          lineHeight: 1,
                          '&:hover': {
                            bgcolor: 'rgba(255, 165, 0, 0.8)'
                          },
                          '&::before': {
                            content: '""',
                            position: 'absolute',
                            top: '-5px',
                            left: '-5px',
                            right: '-5px',
                            bottom: '-5px'
                          },
                          pointerEvents: hoveredTimestamp ? 'none' : 'auto'
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (audioRef.current && timelineRef.current) {
                            const rect = timelineRef.current.getBoundingClientRect();
                            const mouseX = e.clientX - rect.left;
                            const percentageAcross = mouseX / rect.width;
                            const duration = audioRef.current.duration || 1;
                            const time = percentageAcross * duration;
                            const timeStr = time.toFixed(4);

                            setTimestampsSafe((prev) => {
                              const isDuplicate = prev.some((t) => t.time === timeStr);
                              if (!isDuplicate) {
                                const newTimestamp: Timestamp = {
                                  id: generateUniqueId(),
                                  time: timeStr,
                                  image: null
                                };
                                setSelectedTimestamp(newTimestamp.id);
                                return [...prev, newTimestamp].sort(
                                  (a, b) => parseFloat(a.time) - parseFloat(b.time)
                                );
                              }
                              return prev;
                            });
                          }
                        }}
                      >
                        +
                      </Button>

                      {/* Hidden input for direct image upload */}
                      <input
                        ref={imageFileInputRef}
                        type="file"
                        accept={fileTypeToAccept.image}
                        onChange={(e) => {
                          handleFileInputChange(e, activeUploadId || '');
                          setActiveUploadId(null);
                        }}
                        style={{ display: 'none' }}
                      />

                      {/* Render the visible timestamp markers */}
                      {visibleTimestamps.map((stamp, idx) => (
                        <TimestampMarker
                          key={stamp.id}
                          stamp={stamp}
                          index={idx}
                          imageSize={imageSize}
                          imageUrls={imageUrls}
                          selectedTimestamp={selectedTimestamp}
                          hoveredTimestamp={hoveredTimestamp}
                          dragState={dragState}
                          isDeletingTimestamp={isDeletingTimestamp}
                          handleSelection={handleSelection}
                          handleTimestampDrop={handleTimestampDrop}
                          handleImageDrop={handleImageDrop}
                          handleImageError={handleImageError}
                          setTimestamps={setTimestampsSafe}
                          setSelectedTimestamp={setSelectedTimestamp}
                          setImageUrls={setImageUrls}
                          setIsDeletingTimestamp={setIsDeletingTimestamp}
                          setLastDeletedTimestamp={setLastDeletedTimestamp}
                          setHoveredTimestamp={setHoveredTimestamp}
                          isHandlingUploadRef={isHandlingUploadRef}
                          setActiveUploadId={setActiveUploadId}
                          imageFileInputRef={imageFileInputRef}
                          TIMELINE_SIZES={TIMELINE_SIZES}
                          audioRef={audioRef}
                          isAtLeftEdge={isAtLeftEdge}
                          isAtRightEdge={isAtRightEdge}
                          timelineRef={timelineRef}
                          DEADZONE_WIDTH={DEADZONE_WIDTH}
                          fallbackDuration={fallbackDuration}
                          zoom={zoom}
                          dispatch={dispatch}
                        />
                      ))}

                      {/* Playhead */}
                      <Box
                        sx={{
                          position: 'absolute',
                          height: '100%',
                          width: '4px',
                          bgcolor: 'error.main',
                          left: `${
                            (smoothCurrentTime / (audioRef.current?.duration || 1)) * 100
                          }%`,
                          transform: 'translateX(-50%)',
                          zIndex: 1500
                        }}
                      />
                      {/* Playhead Time Label */}
                      <Box
                        sx={{
                          position: 'absolute',
                          bottom: 0,
                          left: `${
                            (smoothCurrentTime / (audioRef.current?.duration || 1)) * 100
                          }%`,
                          transform: 'translateX(-50%)',
                          bgcolor: 'background.paper',
                          px: 0.5,
                          py: 0.25,
                          borderRadius: 0.5,
                          fontSize: '12px',
                          color: 'error.main',
                          fontWeight: 'bold',
                          zIndex: 2000
                        }}
                      >
                        {smoothCurrentTime.toFixed(2)}s
                      </Box>
                    </Box>
                  </Box>
                </Box>

                {/* SIZE TOGGLE (S/M/L) */}
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 8,
                    right: 8,
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

                {/* BOTTOM-LEFT INFO */}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {timestamps.length} timestamp
                    {timestamps.length !== 1 ? 's' : ''}
                  </Typography>
                </Box>
              </Box>
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default PomsSimpleTimeline;