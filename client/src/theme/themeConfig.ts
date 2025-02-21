import { ThemeOptions } from '@mui/material/styles';
import { WorkflowType } from '../stores/nodeStore';

// Shared color palette values
const colors = {
  workflow: {
    primary: '#ffb300',
    background: {
      default: '#121212',
      paper: '#1a1a1a',
    }
  },
  tool: {
    primary: '#e63946', // Vibrant red that works well on light backgrounds
    background: {
      default: '#f5f5f7', // Very light gray with slight blue tint
      paper: '#ffffff'    // Pure white for elevated surfaces
    }
  },
  secondary: '#00695f'
} as const;

// Theme shape variants
const shapes = {
  workflow: {
    borderRadius: 0,
  },
  tool: {
    borderRadius: 8,
  },
} as const;

// Typography variants
const typography = {
  workflow: {
    fontFamily: 'JetBrains Mono',
    fontSize: 14,
    h6: {
      fontFamily: 'JetBrains Mono',
      fontWeight: 700,
      fontSize: '1.15rem',
    },
    button: {
      fontFamily: 'JetBrains Mono',
      textTransform: 'none',
    }
  },
  tool: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 14.5,
    letterSpacing: '0.01em',
    h6: {
      fontFamily: 'Inter, sans-serif',
      fontWeight: 600,
      fontSize: '1.2rem',
      letterSpacing: '0.02em',
    },
    button: {
      fontFamily: 'Inter, sans-serif',
      textTransform: 'none',
      fontWeight: 500,
      fontSize: '0.9rem',
      letterSpacing: '0.015em',
    },
    body1: {
      fontSize: '0.925rem',
      letterSpacing: '0.01em',
    },
    body2: {
      fontSize: '0.85rem',
      letterSpacing: '0.01em',
    }
  }
} as const;

// Base theme configuration that doesn't change with mode
const baseTheme: Partial<ThemeOptions> = {
  components: {
    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          fontFamily: 'inherit',
        },
      },
    },
    // Override default Paper component to respect borderRadius
    MuiPaper: {
      styleOverrides: {
        rounded: {
          borderRadius: 'inherit',
        },
      },
    },
    // Override default Button component to respect borderRadius
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 'inherit',
        },
      },
    },
    // Override default Card component to respect borderRadius
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 'inherit',
        },
      },
    },
  },
};

// Function to create mode-specific theme options
const createModeTheme = (mode: WorkflowType): Partial<ThemeOptions> => ({
  ...baseTheme,
  shape: shapes[mode],
  typography: typography[mode],
  palette: {
    mode: mode === 'workflow' ? 'dark' : 'light',
    primary: {
      main: colors[mode].primary,
    },
    secondary: {
      main: colors.secondary,
    },
    background: colors[mode].background,
  },
});

export const getThemeOptions = (mode: WorkflowType): ThemeOptions => 
  createModeTheme(mode) as ThemeOptions; 