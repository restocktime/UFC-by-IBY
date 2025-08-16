import {
  Box,
  Typography,
  Card,
  CardContent,
} from '@mui/material';

export function FightersPage() {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 4 }}>
        Fighters
      </Typography>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Fighter Profiles & Analytics
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Fighter profile and comparison components will be implemented in the next task.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}