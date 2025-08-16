import { useTheme, useMediaQuery } from '@mui/material';

export function useResponsive() {
  const theme = useTheme();
  
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isTablet = useMediaQuery(theme.breakpoints.between('md', 'lg'));
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));

  return {
    isMobile,
    isTablet,
    isDesktop,
    isSmallScreen,
    breakpoints: {
      xs: useMediaQuery(theme.breakpoints.only('xs')),
      sm: useMediaQuery(theme.breakpoints.only('sm')),
      md: useMediaQuery(theme.breakpoints.only('md')),
      lg: useMediaQuery(theme.breakpoints.only('lg')),
      xl: useMediaQuery(theme.breakpoints.only('xl')),
    },
  };
}