import { FieldProps } from "../NodeContent";
import { useState } from "react";

import Box from "@mui/material/Box";
import MuiTextField from "@mui/material/TextField";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import Dialog from "@mui/material/Dialog";

const FileBrowserField = ({
    fieldKey,
    value,
    style,
    disabled,
    hidden,
    label,
    updateStore,
}: FieldProps) => {
    const [open, setOpen] = useState(false);

    const handleClickOpen = () => {
      setOpen(true);
    };
  
    const handleClose = () => {
      setOpen(false);
    };

    return (
        <Box
            data-key={fieldKey}
            sx={{ ...style }}
            className={`${disabled ? 'mellon-disabled' : ''} ${hidden ? 'mellon-hidden' : ''}`}
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
                    onChange={(e) => updateStore?.(fieldKey, e.target.value)}
                    variant="outlined"
                    type="text"
                    size="small"
                    fullWidth
                    label={label}
                    value={value}
                    className="nodrag"
                    autoComplete="off"
                />
                <IconButton onClick={handleClickOpen}>
                    <FolderOpenOutlinedIcon />
                </IconButton>
            </Stack>
            <Dialog
                open={open}
                onClose={handleClose}
                aria-labelledby="file-browser-dialog"
            >
                <Box>
                    Not yet implemented
                </Box>
            </Dialog>
        </Box>
    );
}

export default FileBrowserField;