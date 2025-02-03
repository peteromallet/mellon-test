import { lazy, Suspense } from "react";
const ThreePreview = lazy(() => import('./UIThreePreview'));

import { FieldProps } from "../NodeContent";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

const UIThreeFields = ({ fieldKey, value, style, disabled, hidden }: FieldProps) => {
    return (
        <Box
            data-key={fieldKey}
            sx={{ p: 0, m: 0, mt: 1, mb: 1, ...style }}
            className={`nodrag nowheel ${disabled ? 'mellon-disabled' : ''} ${hidden ? 'mellon-hidden' : ''}`}
        >
            <Suspense fallback={
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '768px', height: '768px' }}>
                    <CircularProgress />
                </Box>
            }>
                <ThreePreview value={value} />
            </Suspense>
        </Box>
    );
};

export default UIThreeFields;