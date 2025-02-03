import Box from "@mui/material/Box/Box";
import Select from "@mui/material/Select";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import { FieldProps } from "../NodeContent";
import { useEffect } from "react";

const SelectField = ({ fieldKey, value, style, disabled, hidden, label, options, updateStore, onChangeAction }: FieldProps) => {

    const handleShowAction = (value: string, optionsMap: object) => {
        Object.entries(optionsMap).forEach(([key, target]: any) => {
            const isHidden = key !== value;

            if (!target) return;

            if (!Array.isArray(target)) {
                target = [target];
            }

            target.forEach((t: string) => {
                if (t.endsWith('_group')) {
                    updateStore?.(t, { hidden: isHidden }, 'group');
                } else {
                    updateStore?.(t, isHidden, 'hidden');
                }
            });
        });
    };

    const menuItems = Array.isArray(options) ? (
        options.map((v: any, i: number) => (
            <option key={`${fieldKey}-${i}`} value={v}>{v}</option>
        ))
    ) : (
        Object.entries(options).map(([k, v]: any) => (
            <option key={`${fieldKey}-${k}`} value={k}>
                {typeof v === 'object' ? v.label : v}
            </option>
        ))
    );

    useEffect(() => {
        if (onChangeAction?.action === 'show') {
            handleShowAction(value, onChangeAction?.target);
        }
    }, [value]);

    return (
        <Box
            data-key={fieldKey}
            className={`nodrag ${disabled ? 'mellon-disabled' : ''} ${hidden ? 'mellon-hidden' : ''}`}
            sx={{ ...style }}
        >
            <FormControl fullWidth>
                <InputLabel>{label}</InputLabel>
                <Select
                    fullWidth
                    size="small"
                    label={label}
                    value={value || ''}
                    native
                    onChange={(e) => updateStore?.(fieldKey, e.target.value)}
                >
                    {menuItems}
                </Select>
            </FormControl>
        </Box>
    )
};

export default SelectField;
