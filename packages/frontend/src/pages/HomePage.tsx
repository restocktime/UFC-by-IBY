
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
} from '@mui/material';
import {
  Sports as FightersIcon,
  Psychology as PredictionsIcon,
  TrendingUp as OddsIcon,
  Notifications as AlertsIcon,
} from '@mui/icons-material';
import { StatCard } from '../components/common/StatCard';

export function HomePage() {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 4 }}>
        Dashboard
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Fighters"
            value="1,247"
            subtitle="Tracked profiles"
            icon={<FightersIcon fontSize="large" />}
            trend={{ value: 5.2, isPositive: true }}
            color="primary"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Predictions Made"
            value="89"
            subtitle="This month"
            icon={<PredictionsIcon fontSize="large" />}
            trend={{ value: 12.3, isPositive: true }}
            color="secondary"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Accuracy Rate"
            value="73.2%"
            subtitle="Last 30 days"
            icon={<OddsIcon fontSize="large" />}
            trend={{ value: 2.1, isPositive: true }}
            color="success"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Alerts"
            value="24"
            subtitle="Monitoring"
            icon={<AlertsIcon fontSize="large" />}
            color="info"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Upcoming Events
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Event data will be displayed here
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Activity
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Activity feed will be displayed here
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}