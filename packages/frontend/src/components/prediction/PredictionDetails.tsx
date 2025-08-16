import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  LinearProgress,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Tooltip,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Psychology,
  Timeline,
  Speed,
  Shield,
  FitnessCenter,
  AccessTime,
} from '@mui/icons-material';
import { Fight } from '@shared/types/fight';
import { Fighter } from '@shared/types/fighter';
import { PredictionResult, FeatureImportance } from '@shared/types/prediction';
import { Event } from '@shared/types/event';
import { formatDate, formatWeightClass, formatRecord, formatPercentage } from '../../utils/formatters';

interface PredictionDetailsProps {
  open: boolean;
  onClose: () => void;
  fight: Fight;
  fighter1: Fighter;
  fighter2: Fighter;
  event: Event;
  prediction: PredictionResult;
}

export function PredictionDetails({
  open,
  onClose,
  fight,
  fighter1,
  fighter2,
  event,
  prediction,
}: PredictionDetailsProps) {
  const getFeatureIcon = (feature: string) => {
    const iconMap: Record<string, React.ReactElement> = {
      'striking_accuracy': <Speed />,
      'takedown_defense': <Shield />,
      'fight_frequency': <AccessTime />,
      'recent_form': <TrendingUp />,
      'experience': <Psychology />,
      'physical_advantage': <FitnessCenter />,
      'camp_quality': <Timeline />,
    };
    
    return iconMap[feature] || <Psychology />;
  };

  const getImportanceColor = (importance: number) => {
    if (importance >= 0.7) return 'error';
    if (importance >= 0.4) return 'warning';
    return 'info';
  };

  const winnerProbabilities = {
    fighter1: Math.round(prediction.winnerProbability.fighter1 * 100),
    fighter2: Math.round(prediction.winnerProbability.fighter2 * 100),
  };

  const methodProbabilities = {
    ko: Math.round(prediction.methodPrediction.ko * 100),
    submission: Math.round(prediction.methodPrediction.submission * 100),
    decision: Math.round(prediction.methodPrediction.decision * 100),
  };

  const roundProbabilities = Object.entries(prediction.roundPrediction).map(([round, prob]) => ({
    round: round.replace('round', 'Round '),
    probability: Math.round(prob * 100),
  }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'background.paper',
          backgroundImage: 'none',
        },
      }}
    >
      <DialogTitle>
        <Box>
          <Typography variant="h5" component="div" sx={{ fontWeight: 600 }}>
            Fight Prediction Analysis
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {event.name} • {formatDate(event.date)} • {formatWeightClass(fight.weightClass)}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Grid container spacing={3}>
          {/* Fight Overview */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Fight Overview
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ textAlign: 'center', flex: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {fighter1.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatRecord(fighter1.record.wins, fighter1.record.losses, fighter1.record.draws)}
                      {fighter1.rankings.rank && ` • #${fighter1.rankings.rank}`}
                    </Typography>
                  </Box>
                  <Typography variant="h4" color="text.secondary" sx={{ mx: 3 }}>
                    VS
                  </Typography>
                  <Box sx={{ textAlign: 'center', flex: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {fighter2.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatRecord(fighter2.record.wins, fighter2.record.losses, fighter2.record.draws)}
                      {fighter2.rankings.rank && ` • #${fighter2.rankings.rank}`}
                    </Typography>
                  </Box>
                </Box>
                
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {fight.titleFight && (
                    <Chip label="Title Fight" color="secondary" variant="filled" />
                  )}
                  {fight.mainEvent && (
                    <Chip label="Main Event" color="primary" variant="filled" />
                  )}
                  <Chip 
                    label={`${Math.round(prediction.confidence * 100)}% Confidence`} 
                    color={prediction.confidence >= 0.7 ? 'success' : 'warning'} 
                    variant="outlined" 
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Win Probability */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Win Probability
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {fighter1.name}
                    </Typography>
                    <Typography variant="h6" color="primary">
                      {winnerProbabilities.fighter1}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={winnerProbabilities.fighter1}
                    sx={{
                      height: 12,
                      borderRadius: 1,
                      bgcolor: 'grey.800',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: winnerProbabilities.fighter1 > 50 ? 'success.main' : 'warning.main',
                      },
                    }}
                  />
                </Box>
                
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {fighter2.name}
                    </Typography>
                    <Typography variant="h6" color="primary">
                      {winnerProbabilities.fighter2}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={winnerProbabilities.fighter2}
                    sx={{
                      height: 12,
                      borderRadius: 1,
                      bgcolor: 'grey.800',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: winnerProbabilities.fighter2 > 50 ? 'success.main' : 'warning.main',
                      },
                    }}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Method Prediction */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Method Prediction
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body1">KO/TKO</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, ml: 2 }}>
                      <LinearProgress
                        variant="determinate"
                        value={methodProbabilities.ko}
                        sx={{ flex: 1, height: 8, borderRadius: 1 }}
                      />
                      <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'right' }}>
                        {methodProbabilities.ko}%
                      </Typography>
                    </Box>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body1">Submission</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, ml: 2 }}>
                      <LinearProgress
                        variant="determinate"
                        value={methodProbabilities.submission}
                        sx={{ flex: 1, height: 8, borderRadius: 1 }}
                      />
                      <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'right' }}>
                        {methodProbabilities.submission}%
                      </Typography>
                    </Box>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body1">Decision</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, ml: 2 }}>
                      <LinearProgress
                        variant="determinate"
                        value={methodProbabilities.decision}
                        sx={{ flex: 1, height: 8, borderRadius: 1 }}
                      />
                      <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'right' }}>
                        {methodProbabilities.decision}%
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Round Prediction */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Round Prediction
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {roundProbabilities.map(({ round, probability }) => (
                    <Box key={round} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">{round}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, ml: 2 }}>
                        <LinearProgress
                          variant="determinate"
                          value={probability}
                          sx={{ flex: 1, height: 6, borderRadius: 1 }}
                        />
                        <Typography variant="body2" sx={{ minWidth: 35, textAlign: 'right' }}>
                          {probability}%
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Key Factors */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Key Factors
                </Typography>
                <List dense>
                  {prediction.keyFactors.slice(0, 6).map((factor, index) => (
                    <ListItem key={index} sx={{ px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        {getFeatureIcon(factor.feature)}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                              {factor.feature.replace(/_/g, ' ')}
                            </Typography>
                            <Chip
                              label={formatPercentage(factor.importance * 100)}
                              size="small"
                              color={getImportanceColor(factor.importance)}
                              variant="outlined"
                            />
                          </Box>
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary">
                            {factor.description}
                          </Typography>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Model Info */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Model Information
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Chip
                    label={`Model Version: ${prediction.modelVersion}`}
                    variant="outlined"
                  />
                  <Chip
                    label={`Generated: ${formatDate(prediction.timestamp)}`}
                    variant="outlined"
                  />
                  <Chip
                    label={`Confidence: ${Math.round(prediction.confidence * 100)}%`}
                    color={prediction.confidence >= 0.7 ? 'success' : 'warning'}
                    variant="outlined"
                  />
                </Box>
                
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  This prediction is generated using machine learning models trained on historical UFC data. 
                  Predictions are for analytical purposes only and should not be used for gambling.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}