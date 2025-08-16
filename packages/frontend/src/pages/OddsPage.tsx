import { Box } from '@mui/material';
import { OddsTracker } from '../components/odds/OddsTracker';

export function OddsPage() {
  return (
    <Box sx={{ p: 3 }}>
      <OddsTracker />
    </Box>
  );
}