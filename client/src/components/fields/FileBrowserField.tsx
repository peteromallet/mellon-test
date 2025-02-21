import { FieldProps } from "../NodeContent";
import { useState, useRef, useCallback, memo } from "react";
import config from "../../../config";
import { useWebsocketState } from "../../stores/websocketStore";

import Box from "@mui/material/Box";
import MuiTextField from "@mui/material/TextField";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import CloseIcon from '@mui/icons-material/Close';
import Card from "@mui/material/Card";
import CardMedia from "@mui/material/CardMedia";

interface ExtendedFieldProps extends FieldProps {
    accept?: string;  // File type accept string (e.g. "image/*,audio/*")
    fileType?: 'image' | 'audio' | 'video' | 'text' | 'any';  // Type of file for validation
}

// Map file types to accept strings
const fileTypeToAccept: Record<string, string> = {
    'image': '.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg',
    'audio': '.mp3,.wav,.ogg,.m4a,.aac,.webm',
    'video': '.mp4,.webm,.ogv',
    'text': '.txt,.md,.html,.css,.js,.json',
    'any': '*/*'
};

const FilePreview = memo(({ value, fileType, onClear }: { 
    value: string | null, 
    fileType: string,
    onClear: () => void 
}) => {
    if (!value) return null;

    // Only show preview for files in the data/files directory
    if (!value.startsWith('data/files/')) return null;

    const fileUrl = `http://${config.serverAddress}/${value}`;

    const PreviewWrapper = ({ children }: { children: React.ReactNode }) => (
        <Box sx={{ 
            position: 'relative', 
            mt: 1,
            mx: -2  // Negative margin to counteract the Stack padding
        }}>
            <IconButton
                size="small"
                onClick={onClear}
                sx={{
                    position: 'absolute',
                    right: 8,  // Adjusted to account for new margin
                    top: -8,
                    zIndex: 1,
                    bgcolor: 'background.paper',
                    boxShadow: 1,
                    '&:hover': {
                        bgcolor: 'background.paper',
                    }
                }}
            >
                <CloseIcon fontSize="small" />
            </IconButton>
            {children}
        </Box>
    );

    switch (fileType) {
        case 'image':
            return (
                <PreviewWrapper>
                    <Card sx={{ width: '100%' }}>
                        <CardMedia
                            component="img"
                            height="140"
                            image={fileUrl}
                            sx={{ objectFit: 'contain', width: '100%' }}
                        />
                    </Card>
                </PreviewWrapper>
            );
        case 'audio':
            return (
                <PreviewWrapper>
                    <Box sx={{ width: '100%' }}>
                        <audio controls src={fileUrl} style={{ width: '100%' }} />
                    </Box>
                </PreviewWrapper>
            );
        case 'video':
            return (
                <PreviewWrapper>
                    <Box sx={{ width: '100%' }}>
                        <video 
                            controls 
                            src={fileUrl} 
                            style={{ width: '100%', maxHeight: '200px', objectFit: 'contain' }} 
                        />
                    </Box>
                </PreviewWrapper>
            );
        default:
            return null;
    }
});

FilePreview.displayName = 'FilePreview';

const FileBrowserField = memo(({
    fieldKey,
    value,
    style,
    disabled,
    hidden,
    label,
    updateStore,
    accept,
    fileType = 'any',
}: ExtendedFieldProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const { sid } = useWebsocketState();

    const validateFile = useCallback((file: File): boolean => {
        if (fileType === 'any') return true;

        const fileTypeMap: Record<string, RegExp> = {
            'image': /^image\/(jpeg|png|gif|webp|bmp|svg\+xml)$/i,
            'audio': /^audio\/(mpeg|wav|ogg|mp4|aac|webm)$/i,
            'video': /^video\/(mp4|webm|ogg)$/i,
            'text': /^text\/(plain|markdown|html|css|javascript|json)$/i
        };

        const validationType = fileTypeMap[fileType];
        if (!validationType) return true;

        if (!validationType.test(file.type)) {
            setError(`Invalid file type. Allowed types: ${fileTypeToAccept[fileType].split(',').join(', ')}`);
            return false;
        }
        return true;
    }, [fileType]);

    const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setError(null);

        // Explicit size validation
        if (file.size === 0) {
            setError('Selected file is empty');
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            return;
        }

        if (!validateFile(file)) {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            return;
        }

        try {
            setUploading(true);
            
            // Create a fresh blob from the file to ensure a clean stream
            const fileBlob = file.slice(0, file.size, file.type);
            const formData = new FormData();
            formData.append('file', fileBlob, file.name);

            console.log('FileBrowser: Starting upload', {
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                blobSize: fileBlob.size
            });

            const response = await fetch(`http://${config.serverAddress}/data/files`, {
                method: 'POST',
                body: formData,
                credentials: 'include',
                mode: 'cors'
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Upload failed: ${errorText}`);
            }

            const fileName = await response.text();
            const filePath = `data/files/${fileName}`;

            // Verify the file exists on the server
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for file to be written
            const checkResponse = await fetch(`http://${config.serverAddress}/${filePath}`, {
                method: 'HEAD',
                credentials: 'include',
                mode: 'cors'
            });

            if (!checkResponse.ok) {
                throw new Error('File was not properly saved on the server');
            }

            updateStore?.(fieldKey, filePath);
        } catch (error) {
            console.error('Error uploading file:', error);
            setError(error instanceof Error ? error.message : 'Failed to upload file');
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    }, [fieldKey, validateFile, updateStore]);

    const handleBrowseClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setError(null);
        updateStore?.(fieldKey, e.target.value);
    }, [fieldKey, updateStore]);

    const handleClear = useCallback(() => {
        updateStore?.(fieldKey, '');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [fieldKey, updateStore]);

    return (
        <Box
            data-key={fieldKey}
            sx={{ ...style }}
            className={`${disabled ? 'mellon-disabled' : ''} ${hidden ? 'mellon-hidden' : ''}`}
        >
            <Stack
                direction="column"
                spacing={1}
            >
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                        '& > .MuiBox-root': { flex: "1" },
                        '& > .flex-auto': { flex: "0 0 auto" },
                        justifyContent: "center",
                        alignItems: "stretch",
                    }}
                >
                    <MuiTextField
                        onChange={handleTextChange}
                        variant="outlined"
                        type="text"
                        size="small"
                        fullWidth
                        label={label}
                        value={value || ''}
                        className="nodrag"
                        autoComplete="off"
                        error={!!error}
                        helperText={error}
                        disabled={disabled || uploading}
                    />
                    <IconButton 
                        onClick={handleBrowseClick} 
                        disabled={disabled || uploading}
                    >
                        <FolderOpenOutlinedIcon />
                    </IconButton>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        onChange={handleFileSelect}
                        accept={accept || fileTypeToAccept[fileType]}
                        disabled={disabled || uploading}
                    />
                </Stack>
                {error && (
                    <Box sx={{ color: 'error.main', fontSize: '0.75rem', px: 1 }}>
                        {error}
                    </Box>
                )}
                <FilePreview 
                    value={value} 
                    fileType={fileType} 
                    onClear={handleClear}
                />
            </Stack>
        </Box>
    );
});

FileBrowserField.displayName = 'FileBrowserField';

export default FileBrowserField;