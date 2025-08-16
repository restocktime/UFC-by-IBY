import { Box, useTheme } from '@mui/material';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { FightRecord } from '@ufc-platform/shared';

interface RecordChartProps {
  record: FightRecord;
}

export function RecordChart({ record }: RecordChartProps) {
  const theme = useTheme();

  const data = [
    { name: 'Wins', value: record.wins, color: theme.palette.success.main },
    { name: 'Losses', value: record.losses, color: theme.palette.error.main },
    { name: 'Draws', value: record.draws, color: theme.palette.warning.main },
    { name: 'No Contests', value: record.noContests, color: theme.palette.info.main },
  ].filter(item => item.value > 0); // Only show categories with values > 0

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
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
          <p style={{ color: data.payload.color }}>
            {`${data.name}: ${data.value}`}
          </p>
        </Box>
      );
    }
    return null;
  };

  const CustomLegend = ({ payload }: any) => {
    return (
      <Box display="flex" justifyContent="center" flexWrap="wrap" gap={2} mt={2}>
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
            <span style={{ color: theme.palette.text.secondary, fontSize: '0.875rem' }}>
              {entry.value}: {entry.payload.value}
            </span>
          </Box>
        ))}
      </Box>
    );
  };

  if (data.length === 0) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height={300}
        color="text.secondary"
      >
        No fight record data available
      </Box>
    );
  }

  return (
    <Box height={300}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
        </PieChart>
      </ResponsiveContainer>
    </Box>
  );
}