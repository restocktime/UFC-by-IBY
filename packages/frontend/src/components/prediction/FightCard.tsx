import React from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Chip,
  Avatar,
  LinearProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Info,
  Schedule,
  EmojiEvents,
} from '@mui/icons-material';
import { Fight } from '@shared/types/fight';
import { Fighter } from '@shared/types/fighter';
import { PredictionResult } from '@shared/types/prediction';
import { Event } from '@shared/types/event';
import { formatDate, formatWeightClass, formatRecord } from '../../utils/formatters';

interface FightCardProps {
  fight: Fight;
  fighter1: Fighter;
  fighter2: Fighter;
  event: Event;
  prediction?: PredictionResult;
  onClick?: () => void;
}

export function FightCard({
  fight,
  fighter1,
  fighter2,
  event,
  prediction,
  onClick,
}: FightCardProps) {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'success';
    if (confidence >= 0.6) return 'warning';
    return 'error';
  };

  const getWinnerProbability = () => {
    if (!prediction) return { fighter1: 50, fighter2: 50 };
    return {
      fighter1: Math.round(prediction.winnerProbability.fighter1 * 100),
      fighter2: Math.round(prediction.winnerProbability.fighter2 * 100),
    };
  };

  const probabilities = getWinnerProbability();
  const isMainEvent = fight.mainEvent;
  const isTitleFight = fight.titleFight;

  return (
    <Card
      sx={{
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease-in-out',
        '&:hover': onClick ? {
          transform: 'translateY(-2px)',
          boxShadow: 3,
        } : {},
        border: isMainEvent ? '2px solid #d20a11' : '1px solid #333',
        position: 'relative',
      }}
      onClick={onClick}
    >
      {/* Event badges */}
      <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 0.5 }}>
        {isTitleFight && (
          <Tooltip title="Title Fight">
            <Chip
              icon={<EmojiEvents />}
              label="Title"
              size="small"
              color="secondary"
              variant="filled"
            />
          </Tooltip>
        )}
        {isMainEvent && (
          <Chip
            label="Main Event"
            size="small"
            color="primary"
            variant="filled"
          />
        )}
      </Box>

      <CardContent sx={{ pb: 2 }}>
        {/* Event info */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Schedule fontSize="small" />
            {event.name} • {formatDate(event.date)} • {event.venue.city}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatWeightClass(fight.weightClass)} • {fight.scheduledRounds} Rounds
          </Typography>
        </Box>

        {/* Fighters */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          {/* Fighter 1 */}
          <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <Avatar
              sx={{
                width: 48,
                height: 48,
                mr: 2,
                bgcolor: probabilities.fighter1 > probabilities.fighter2 ? 'success.main' : 'grey.600',
              }}
            >
              {fighter1.name.split(' ').map(n => n[0]).join('')}
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {fighter1.name}
                {fighter1.nickname && (
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                    "{fighter1.nickname}"
                  </Typography>
                )}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatRecord(fighter1.record.wins, fighter1.record.losses, fighter1.record.draws)}
                {fighter1.rankings.rank && ` • #${fighter1.rankings.rank}`}
              </Typography>
            </Box>
          </Box>

          {/* VS */}
          <Box sx={{ mx: 2, textAlign: 'center' }}>
            <Typography variant="h5" color="text.secondary" sx={{ fontWeight: 'bold' }}>
              VS
            </Typography>
          </Box>

          {/* Fighter 2 */}
          <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, flexDirection: 'row-reverse' }}>
            <Avatar
              sx={{
                width: 48,
                height: 48,
                ml: 2,
                bgcolor: probabilities.fighter2 > probabilities.fighter1 ? 'success.main' : 'grey.600',
              }}
            >
              {fighter2.name.split(' ').map(n => n[0]).join('')}
            </Avatar>
            <Box sx={{ flex: 1, textAlign: 'right' }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {fighter2.name}
                {fighter2.nickname && (
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ mr: 1 }}>
                    "{fighter2.nickname}"
                  </Typography>
                )}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatRecord(fighter2.record.wins, fighter2.record.losses, fighter2.record.draws)}
                {fighter2.rankings.rank && ` • #${fighter2.rankings.rank}`}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Prediction */}
        {prediction && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                AI Prediction
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Chip
                  label={`${Math.round(prediction.confidence * 100)}% Confidence`}
                  size="small"
                  color={getConfidenceColor(prediction.confidence)}
                  variant="outlined"
                />
                <Tooltip title="View detailed analysis">
                  <IconButton size="small">
                    <Info fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            {/* Win probability bars */}
            <Box sx={{ mb: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {probabilities.fighter1}%
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {probabilities.fighter2}%
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <LinearProgress
                  variant="determinate"
                  value={probabilities.fighter1}
                  sx={{
                    flex: probabilities.fighter1,
                    height: 8,
                    borderRadius: 1,
                    bgcolor: 'grey.800',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: probabilities.fighter1 > probabilities.fighter2 ? 'success.main' : 'warning.main',
                    },
                  }}
                />
                <LinearProgress
                  variant="determinate"
                  value={probabilities.fighter2}
                  sx={{
                    flex: probabilities.fighter2,
                    height: 8,
                    borderRadius: 1,
                    bgcolor: 'grey.800',
                    transform: 'scaleX(-1)',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: probabilities.fighter2 > probabilities.fighter1 ? 'success.main' : 'warning.main',
                    },
                  }}
                />
              </Box>
            </Box>

            {/* Method prediction */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={`KO: ${Math.round(prediction.methodPrediction.ko * 100)}%`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`Sub: ${Math.round(prediction.methodPrediction.submission * 100)}%`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`Dec: ${Math.round(prediction.methodPrediction.decision * 100)}%`}
                size="small"
                variant="outlined"
              />
            </Box>
          </Box>
        )}

        {!prediction && (
          <Box sx={{ textAlign: 'center', py: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Prediction not available
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}