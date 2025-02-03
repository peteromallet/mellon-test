import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { FieldProps } from "../NodeContent";
import { useTheme } from "@mui/material/styles";

const UITextField = ({
    fieldKey,
    value,
    style,
    disabled,
    hidden,
    label,
}: FieldProps) => {
    const theme = useTheme();
    // const dataUrl = value.url; // not used, but this endpoint can be used to display the text field value
    const dataValue = value.value;

    return (
        <Box>
            <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary, fontWeight: 'bold' }}>{label}</Typography>
            <Box
                component="pre"
                data-key={fieldKey}
                sx={{ color: theme.palette.text.secondary, backgroundColor: '#111', border: `1px solid ${theme.palette.divider}`, borderRadius: 1, padding: 1, m: 0, mb: 1, ...style }}
                className={`${disabled ? 'mellon-disabled' : ''} ${hidden ? 'mellon-hidden' : ''}`}
            >
                <Typography>{dataValue}</Typography>
            </Box>
        </Box>
    );
}

export default UITextField;