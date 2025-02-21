import { useTheme } from '@mui/material/styles';
import { GlobalStyles } from '@mui/material';

export function ThemeInjector() {
  const theme = useTheme();

  const styles = {
    ':root': {
      '--primary-main': theme.palette.primary.main,
      '--secondary-main': theme.palette.secondary.main,
      '--background-default': theme.palette.background.default,
      '--background-paper': theme.palette.background.paper,
    },
  };

  return <GlobalStyles styles={styles} />;
} 