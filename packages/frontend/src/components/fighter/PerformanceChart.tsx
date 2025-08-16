import { Box, useTheme } from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { FormIndicator } from '@ufc-platform/shared';

interface PerformanceChartProps {
  recentForm: FormIndicator[];
}

export function PerformanceChart({ recentForm }: PerformanceChartProps) {
  const theme = useTheme();

  // Transform data for the chart
  const chartData = recentForm
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((form, index) => ({
      fight: `Fight ${index + 1}`,
      performance: form.performance,
      result: form.result,
      date: new Date(form.date).toLocaleDateString(),
    }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <Box
          sx={{
            bgcolor: 'background.paper',
            p: 2,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
          }}
        >
          <p>{`${label}`}</p>
          <p>{`Date: ${data.date}`}</p>
          <p>{`Performance: ${data.performance}/100`}</p>
          <p style={{ 
            color: data.result === 'win' ? theme.palette.success.main : 
                   data.result === 'loss' ? theme.palette.error.main : 
                   theme.palette.warning.main 
          }}>
            {`Result: ${data.result.toUpperCase()}`}
          </p>
        </Box>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height={300}
        color="text.secondary"
      >
        No recent performance data available
      </Box>
    );
  }

  return (
    <Box height={300}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke={theme.palette.divider}
          />
          <XAxis 
            dataKey="fight" 
            stroke={theme.palette.text.secondary}
            fontSize={12}
          />
          <YAxis 
            domain={[0, 100]}
            stroke={theme.palette.text.secondary}
            fontSize={12}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="performance"
            stroke={theme.palette.primary.main}
            strokeWidth={3}
            dot={{
              fill: theme.palette.primary.main,
              strokeWidth: 2,
              r: 6,
            }}
            activeDot={{
              r: 8,
              stroke: theme.palette.primary.main,
              strokeWidth: 2,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}