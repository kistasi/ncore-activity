import { createTheme } from '@mui/material/styles'

// Shares screenplay-catalog's near-black palette, with the orange accent the
// old PHP frontend used.
export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'dark',
    primary: {
      main: '#fb923c',
    },
    background: {
      default: '#0a0a0a',
      paper: '#1a1a1a',
    },
    text: {
      primary: '#ededed',
    },
  },
  typography: {
    fontFamily: 'var(--font-geist-sans), Arial, Helvetica, sans-serif',
  },
  shape: {
    borderRadius: 8,
  },
})
