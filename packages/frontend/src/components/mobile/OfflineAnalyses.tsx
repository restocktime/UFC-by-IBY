import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Divider,
  Avatar,
} from '@mui/material';
import {
  Delete,
  Visibility,
  Share,
  CloudOff,
  CloudDone,
  Sync,
  SyncDisabled,
} from '@mui/icons-material';
import { format } from 'date-fns';

interface SavedAnalysis {
  id: string;
  fightId: string;
  fighter1: string;
  fighter2: string;
  event: string;
  recommendation: {
    type: 'strong_buy' | 'buy' | 'hold' | 'avoid';
    expectedValue: number;
    confidence: number;
  };
  savedDate: string;
  isOffline: boolean;
  synced: boolean;
}

export const OfflineAnalyses: React.FC = () => {
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<SavedAnalysis | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    loadSavedAnalyses();
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadSavedAnalyses = () => {
    const saved = localStorage.getItem('savedAnalyses');
    if (saved) {
      try {
        const analyses = JSON.parse(saved);
        setSavedAnalyses(analyses);
      } catch (error) {
        console.error('Failed to load saved analyses:', error);
      }
    }
  };

  const deleteAnalysis = (id: string) => {
    const updated = savedAnalyses.filter(analysis => analysis.id !== id);
    setSavedAnalyses(updated);
    localStorage.setItem('savedAnalyses', JSON.stringify(updated));
  };

  const syncAnalyses = async () => {
    if (!isOnline) return;
    
    try {
      // Sync unsynced analyses to server
      const unsyncedAnalyses = savedAnalyses.filter(analysis => !analysis.synced);
      
      for (const analysis of unsyncedAnalyses) {
        // API call to sync analysis
        // await apiService.post('/analyses/sync', analysis);
        
        // Mark as synced
        analysis.synced = true;
      }
      
      setSavedAnalyses([...savedAnalyses]);
      localStorage.setItem('savedAnalyses', JSON.stringify(savedAnalyses));
    } catch (error) {
      console.error('Failed to sync analyses:', error);
    }
  };

  const shareAnalysis = async (analysis: SavedAnalysis) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Bet Analysis: ${analysis.fighter1} vs ${analysis.fighter2}`,
          text: `${analysis.recommendation.type.toUpperCase()} - ${analysis.recommendation.expectedValue.toFixed(1)}% EV`,
          url: `${window.location.origin}/analysis/${analysis.id}`,
        });
      } catch (error) {
        console.error('Failed to share analysis:', error);
      }
    }
  };

  const getRecommendationColor = (type: string) => {
    switch (type) {
      case 'strong_buy':
        return 'success';
      case 'buy':
        return 'primary';
      case 'hold':
        return 'warning';
      case 'avoid':
        return 'error';
      default:
        return 'default';
    }
  };

  const unsyncedCount = savedAnalyses.filter(analysis => !analysis.synced).length;

  if (savedAnalyses.length === 0) {
    return (
      <Card>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <CloudOff sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No Saved Analyses
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your saved betting analyses will appear here for offline access
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box>
      {/* Sync Status */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          {isOnline ? (
            <CloudDone color="success" fontSize="small" />
          ) : (
            <CloudOff color="error" fontSize="small" />
          )}
          <Typography variant="body2" color="text.secondary">
            {isOnline ? 'Online' : 'Offline Mode'}
          </Typography>
        </Box>
        
        {isOnline && unsyncedCount > 0 && (
          <Button
            size="small"
            startIcon={<Sync />}
            onClick={syncAnalyses}
            variant="outlined"
          >
            Sync ({unsyncedCount})
          </Button>
        )}
      </Box>

      {/* Offline Notice */}
      {!isOnline && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You're offline. Saved analyses are available for viewing.
        </Alert>
      )}

      {/* Analyses List */}
      <Card>
        <List>
          {savedAnalyses.map((analysis, index) => (
            <React.Fragment key={analysis.id}>
              <ListItem>
                <Box display="flex" alignItems="center" gap={2} flex={1}>
                  <Avatar sx={{ width: 32, height: 32 }}>
                    {analysis.fighter1.charAt(0)}
                  </Avatar>
                  <Box flex={1}>
                    <Typography variant="subtitle2">
                      {analysis.fighter1} vs {analysis.fighter2}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {analysis.event} • {format(new Date(analysis.savedDate), 'MMM dd, HH:mm')}
                    </Typography>
                    <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                      <Chip
                        label={analysis.recommendation.type.replace('_', ' ').toUpperCase()}
                        color={getRecommendationColor(analysis.recommendation.type) as any}
                        size="small"
                      />
                      <Typography variant="caption" color="text.secondary">
                        {analysis.recommendation.expectedValue > 0 ? '+' : ''}{analysis.recommendation.expectedValue.toFixed(1)}% EV
                      </Typography>
                      {!analysis.synced && (
                        <SyncDisabled fontSize="small" color="warning" />
                      )}
                    </Box>
                  </Box>
                </Box>
                
                <ListItemSecondaryAction>
                  <Box display="flex" gap={0.5}>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setSelectedAnalysis(analysis);
                        setDetailsDialogOpen(true);
                      }}
                    >
                      <Visibility fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => shareAnalysis(analysis)}
                    >
                      <Share fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => deleteAnalysis(analysis.id)}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Box>
                </ListItemSecondaryAction>
              </ListItem>
              {index < savedAnalyses.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </List>
      </Card>

      {/* Analysis Details Dialog */}
      <Dialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        {selectedAnalysis && (
          <>
            <DialogTitle>
              {selectedAnalysis.fighter1} vs {selectedAnalysis.fighter2}
            </DialogTitle>
            <DialogContent>
              <Box mb={2}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Event
                </Typography>
                <Typography variant="body1">
                  {selectedAnalysis.event}
                </Typography>
              </Box>

              <Box mb={2}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Recommendation
                </Typography>
                <Box display="flex" alignItems="center" gap={2}>
                  <Chip
                    label={selectedAnalysis.recommendation.type.replace('_', ' ').toUpperCase()}
                    color={getRecommendationColor(selectedAnalysis.recommendation.type) as any}
                  />
                  <Typography variant="h6" color={`${getRecommendationColor(selectedAnalysis.recommendation.type)}.main`}>
                    {selectedAnalysis.recommendation.expectedValue > 0 ? '+' : ''}{selectedAnalysis.recommendation.expectedValue.toFixed(1)}% EV
                  </Typography>
                </Box>
              </Box>

              <Box mb={2}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Confidence
                </Typography>
                <Typography variant="body1">
                  {selectedAnalysis.recommendation.confidence}%
                </Typography>
              </Box>

              <Box mb={2}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Saved
                </Typography>
                <Typography variant="body1">
                  {format(new Date(selectedAnalysis.savedDate), 'MMM dd, yyyy HH:mm')}
                </Typography>
              </Box>

              {!selectedAnalysis.synced && (
                <Alert severity="warning">
                  This analysis hasn't been synced to the cloud yet.
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailsDialogOpen(false)}>
                Close
              </Button>
              <Button
                variant="contained"
                onClick={() => shareAnalysis(selectedAnalysis)}
              >
                Share
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};