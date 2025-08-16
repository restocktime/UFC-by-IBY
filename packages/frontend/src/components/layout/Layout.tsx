import { ReactNode } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Container,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { Navigation } from './Navigation';
import { NotificationCenter } from './NotificationCenter';

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export function Layout({ children, title = 'UFC Prediction Platform' }: LayoutProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar>
          <Typography
            variant="h6"
            component="div"
            sx={{
              flexGrow: 1,
              fontWeight: 700,
              color: theme.palette.primary.main,
            }}
          >
            {title}
          </Typography>
          <NotificationCenter />
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', flexGrow: 1 }}>
        <Navigation isMobile={isMobile} />
        
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: { xs: 2, md: 3 },
            ml: { md: '240px' }, // Navigation drawer width
            transition: theme.transitions.create(['margin'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
          }}
        >
          <Container maxWidth="xl" sx={{ px: { xs: 0, sm: 2 } }}>
            {children}
          </Container>
        </Box>
      </Box>
    </Box>
  );
}