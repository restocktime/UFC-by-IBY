
import { Box, useTheme, Typography } from '@mui/material';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Fighter } from '@ufc-platform/shared';

interface ComparisonChartProps {
  fighter1: Fighter;
  fighter2: Fighter;
}

export function ComparisonChart({ fighter1, fighter2 }: ComparisonChartProps) {
  const theme = useTheme();

  // Prepare data for radar chart
  const getWinPercentage = (fighter: Fighter) => {
    const total = fighter.record.wins + fighter.record.losses + fighter.record.draws;
    return total > 0 ? (fighter.record.wins / total) * 100 : 0;
  };

  const data = [
    {
      metric: 'Win Rate',
      [fighter1.name]: getWinPercentage(fighter1),
      [fighter2.name]: getWinPercentage(fighter2),
    },
    {
      metric: 'Striking Accuracy',
      [fighter1.name]: fighter1.calculatedMetrics.strikingAccuracy.value,
      [fighter2.name]: fighter2.calculatedMetrics.strikingAccuracy.value,
    },
    {
      metric: 'Takedown Defense',
      [fighter1.name]: fighter1.calculatedMetrics.takedownDefense.value,
      [fighter2.name]: fighter2.calculatedMetrics.takedownDefense.value,
    },
    {
      metric: 'Fight Frequency',
      [fighter1.name]: Math.min(fighter1.calculatedMetrics.fightFrequency * 20, 100), // Scale to 0-100
      [fighter2.name]: Math.min(fighter2.calculatedMetrics.fightFrequency * 20, 100), // Scale to 0-100
    },
    {
      metric: 'Win Streak',
      [fighter1.name]: Math.min(fighter1.calculatedMetrics.winStreak * 10, 100), // Scale to 0-100
      [fighter2.name]: Math.min(fighter2.calculatedMetrics.winStreak * 10, 100), // Scale to 0-100
    },
    {
      metric: 'Recent Form',
      [fighter1.name]: fighter1.calculatedMetrics.recentForm.length > 0 
        ? fighter1.calculatedMetrics.recentForm.reduce((acc, form) => acc + form.performance, 0) / fighter1.calculatedMetrics.recentForm.length
        : 50,
      [fighter2.name]: fighter2.calculatedMetrics.recentForm.length > 0 
        ? fighter2.calculatedMetrics.recentForm.reduce((acc, form) => acc + form.performance, 0) / fighter2.calculatedMetrics.recentForm.length
        : 50,
    },
  ];

  const CustomLegend = ({ payload }: any) => {
    return (
      <Box display="flex" justifyContent="center" gap={4} mt={2}>
        {payload.map((entry: any, index: number) => (
          <Box
            key={index}
            display="flex"
            alignItems="center"
            gap={1}
          >
            <Box
              width={12}
              height={12}
              bgcolor={entry.color}
              borderRadius="50%"
            />
            <Typography variant="body2" color="text.secondary">
              {entry.value}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Box>
      <Box height={400}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data}>
            <PolarGrid stroke={theme.palette.divider} />
            <PolarAngleAxis 
              dataKey="metric" 
              tick={{ 
                fill: theme.palette.text.secondary, 
                fontSize: 12 
              }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ 
                fill: theme.palette.text.secondary, 
                fontSize: 10 
              }}
            />
            <Radar
              name={fighter1.name}
              dataKey={fighter1.name}
              stroke={theme.palette.primary.main}
              fill={theme.palette.primary.main}
              fillOpacity={0.2}
              strokeWidth={2}
            />
            <Radar
              name={fighter2.name}
              dataKey={fighter2.name}
              stroke={theme.palette.secondary.main}
              fill={theme.palette.secondary.main}
              fillOpacity={0.2}
              strokeWidth={2}
            />
            <Legend content={<CustomLegend />} />
          </RadarChart>
        </ResponsiveContainer>
      </Box>
      
      <Box mt={2}>
        <Typography variant="caption" color="text.secondary" display="block" textAlign="center">
          * Fight Frequency and Win Streak values are scaled for visualization purposes
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" textAlign="center">
          * Recent Form shows average performance score from recent fights
        </Typography>
      </Box>
    </Box>
  );
}