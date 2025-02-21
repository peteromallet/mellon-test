import React, { useRef, useState, useEffect } from 'react';
import { Box, IconButton, Slider, Stack, Typography } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import FastRewindIcon from '@mui/icons-material/FastRewind';
import FastForwardIcon from '@mui/icons-material/FastForward';
import config from '../../../config';
import { FieldProps } from '../NodeContent';
import { useTheme } from "@mui/material/styles";

const UIVideoPlayer = ({
  fieldKey,
  value,
  style,
  disabled,
  hidden,
  label,
  updateStore
}: FieldProps) => {
    const theme = useTheme();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);
    
    const dataValue = value?.value;
    
    useEffect(() => {
        console.log('UIVideoPlayer mounted with props:', {
            value,
            fieldKey,            
            configServer: config.serverAddress,
            valueIsNull: value === null,
        });
    }, [value, fieldKey]);

    useEffect(() => {
        if (error) {
            console.log('UIVideoPlayer: error updated:', error);
        }
    }, [error]);

    // Add effect to reset error state when video source changes
    useEffect(() => {
        setError(null);
        setPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        
        // Also reset the video element if it exists
        if (videoRef.current) {
            videoRef.current.load(); // Force reload of video element
        }
    }, [dataValue]); // Reset when video source changes

    // If there's no usable string in videoValue, just render a "No video selected" placeholder
    if (!dataValue) {
        console.log('UIVideoPlayer: Rendering placeholder because videoValue is falsy:', dataValue);
        return (
        <Box
            component="div"
            sx={{
            width: '100%',
            aspectRatio: '16/9',
            maxHeight: '200px',
            backgroundColor: 'black',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
            }}
            style={style}
        >
            <Typography variant="body2" color="gray">
            No video selected
            </Typography>
        </Box>
        );
    }

    // Build the final video URL
    // If filePath doesn't start with '/', assume it needs '/data/files/' prepended
    const filePath = dataValue;
    const adjustedPath = filePath.startsWith('/') ? filePath : `/data/files/${filePath}`;
    const videoUrl = `http://${config.serverAddress}${adjustedPath}`;
    console.log('UIVideoPlayer: Final videoUrl:', videoUrl);

    const handlePlayPause = () => {
        if (!videoRef.current) return;
        if (playing) {
        videoRef.current.pause();
        setPlaying(false);
        } else {
        videoRef.current
            .play()
            .then(() => setPlaying(true))
            .catch(err => {
            setError(`Failed to play video: ${err.message}`);
            setPlaying(false);
            });
        }
    };

    const handleRewind = () => {
        if (videoRef.current) {
        videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
        }
    };

    const handleForward = () => {
        if (videoRef.current) {
        videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 10, duration);
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration);
            setError(null); // Clear any previous errors
        }
    };

    const handleError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const target = e.currentTarget;
        if (!target.error) {
            setError('Failed to load video: Unknown error');
        } else {
            // More detailed error message based on error code
            switch (target.error.code) {
                case 1:
                    setError('Video loading aborted');
                    break;
                case 2:
                    setError('Network error while loading video');
                    break;
                case 3:
                    setError('Error decoding video');
                    break;
                case 4:
                    setError('Video not supported');
                    break;
                default:
                    setError(`Failed to load video: ${target.error.message || 'Unknown error'}`);
            }
        }
        setPlaying(false);
    };

    const handleSliderChange = (
        _event: Event,
        sliderValue: number | number[],
        _activeThumb: number
    ) => {
        if (!videoRef.current) return;
        if (typeof sliderValue === 'number') {
        videoRef.current.currentTime = sliderValue;
        setCurrentTime(sliderValue);
        }
    };

    if (error) {
        return (
        <Box
            component="div"
            sx={{
            p: 2,
            bgcolor: 'error.main',
            color: 'error.contrastText',
            borderRadius: 1
            }}
            style={style}
        >
            {error}
        </Box>
        );
    }

    return (
        <Box 
            component="div" 
            style={style}
            className="nodrag"
        >
            <video
                ref={videoRef}
                src={videoUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onError={handleError}
                style={{ width: '100%', maxHeight: '500px', backgroundColor: 'black' }}
            />
            <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                justifyContent="center"
                sx={{ mt: 1 }}
            >
                <IconButton onClick={handleRewind} aria-label="rewind">
                <FastRewindIcon />
                </IconButton>
                <IconButton onClick={handlePlayPause} aria-label={playing ? 'pause' : 'play'}>
                {playing ? <PauseIcon /> : <PlayArrowIcon />}
                </IconButton>
                <IconButton onClick={handleForward} aria-label="forward">
                <FastForwardIcon />
                </IconButton>
            </Stack>
            <Slider
                value={currentTime}
                min={0}
                max={duration}
                step={1}
                onChange={handleSliderChange}
                aria-label="time slider"
            />
        </Box>
    );
    };

    export default UIVideoPlayer;
