import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Chip,
  Avatar,
  LinearProgress,
  Alert,
  Divider,
  IconButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Search,
  TrendingUp,
  TrendingDown,
  Assessment,
  MonetizationOn,
  Warning,
  CheckCircle,
  ExpandMore,
  Share,
  Bookmark,
  Calculate,
} from '@mui/icons-material';
import { apiService } from '../../services/api';

interface BetAnalysis {
  fightId: string;
  fighter1: {
    name: string;
    odds: number;
    impliedProbability: number;
    avatar?: string;
  };
  fighter2: {
    name: string;
    odds: number;
    impliedProbability: number;
    avatar?: string;
  };
  recommendation: {
    type: 'strong_buy' | 'buy' | 'hold' | 'avoid';
    confidence: number;
    expectedValue: number;
    reasoning: string[];
  };
  keyFactors: {
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    weight: number;
  }[];
  riskAssessment: {
    level: 'low' | 'medium' | 'high';
    factors: string[];
  };
  suggestedStake: {
    percentage: number;
    amount: number;
    maxAmount: number;
  };
}

interface QuickBetAnalyzerProps {
  bankroll?: number;
}

export const QuickBetAnalyzer: React.FC<QuickBetAnalyzerProps> = ({
  bankroll = 1000,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedFight, setSelectedFight] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<BetAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedAnalyses, setSavedAnalyses] = useState<string[]>([]);

  const searchFights = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const results = await apiService.get('/fights/search', {
        params: { q: query, upcoming: true }
      });
      setSearchResults(results);
    } catch (error) {
      console.error('Failed to search fights:', error);
    }
  };

  const analyzebet = async (fightId: string) => {
    setLoading(true);
    try {
      const result = await apiService.get<BetAnalysis>(`/betting/analyze/${fightId}`);
      setAnalysis(result);
    } catch (error) {
      console.error('Failed to analyze bet:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveAnalysis = () => {
    if (analysis) {
      const saved = [...savedAnalyses, analysis.fightId];
      setSavedAnalyses(saved);
      localStorage.setItem('savedAnalyses', JSON.stringify(saved));
    }
  };

  const shareAnalysis = async () => {
    if (analysis && navigator.share) {
      try {
        await navigator.share({
          title: `Bet Analysis: ${analysis.fighter1.name} vs ${analysis.fighter2.name}`,
          text: `${analysis.recommendation.type.toUpperCase()} - ${analysis.recommendation.expectedValue.toFixed(1)}% EV`,
          url: window.location.href,
        });
      } catch (error) {
        console.error('Failed to share:', error);
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

  const getRecommendationIcon = (type: string) => {
    switch (type) {
      case 'strong_buy':
        return <TrendingUp />;
      case 'buy':
        return <TrendingUp />;
      case 'hold':
        return <Assessment />;
      case 'avoid':
        return <TrendingDown />;
      default:
        return <Assessment />;
    }
  };

  const formatOdds = (odds: number): string => {
    return odds > 0 ? `+${odds}` : `${odds}`;
  };

  useEffect(() => {
    const saved = localStorage.getItem('savedAnalyses');
    if (saved) {
      setSavedAnalyses(JSON.parse(saved));
    }
  }, []);

  return (
    <Box>
      {/* Search Section */}
      <Box mb={3}>
        <TextField
          fullWidth
          placeholder="Search for fights to analyze..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            searchFights(e.target.value);
          }}
          InputProps={{
            startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />,
          }}
          variant="outlined"
          size="small"
        />
        
        {searchResults.length > 0 && (
          <Box mt={2}>
            {searchResults.slice(0, 5).map((fight) => (
              <Card 
                key={fight.id} 
                sx={{ 
                  mb: 1, 
                  cursor: 'pointer',
                  '&:hover': { boxShadow: 2 },
                }}
                onClick={() => {
                  setSelectedFight(fight.id);
                  analyzebet(fight.id);
                  setSearchResults([]);
                  setSearchQuery(`${fight.fighter1} vs ${fight.fighter2}`);
                }}
              >
                <CardContent sx={{ py: 1 }}>
                  <Typography variant="subtitle2">
                    {fight.fighter1} vs {fight.fighter2}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {fight.event} - {new Date(fight.date).toLocaleDateString()}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Box>

      {/* Loading State */}
      {loading && (
        <Box mb={3}>
          <LinearProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Analyzing betting opportunity...
          </Typography>
        </Box>
      )}

      {/* Analysis Results */}
      {analysis && !loading && (
        <Box>
          {/* Fight Header */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">
                  Analysis Results
                </Typography>
                <Box>
                  <IconButton size="small" onClick={shareAnalysis}>
                    <Share />
                  </IconButton>
                  <IconButton 
                    size="small" 
                    onClick={saveAnalysis}
                    color={savedAnalyses.includes(analysis.fightId) ? 'primary' : 'default'}
                  >
                    <Bookmark />
                  </IconButton>
                </Box>
              </Box>

              <Grid container spacing={2} alignItems="center">
                <Grid item xs={5}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Avatar src={analysis.fighter1.avatar} sx={{ width: 32, height: 32 }}>
                      {analysis.fighter1.name.charAt(0)}
                    </Avatar>
                    <Box>
                      <Typography variant="subtitle2">
                        {analysis.fighter1.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatOdds(analysis.fighter1.odds)}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                
                <Grid item xs={2} textAlign="center">
                  <Typography variant="caption" color="text.secondary">
                    VS
                  </Typography>
                </Grid>
                
                <Grid item xs={5}>
                  <Box display="flex" alignItems="center" gap={1} justifyContent="flex-end">
                    <Box textAlign="right">
                      <Typography variant="subtitle2">
                        {analysis.fighter2.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatOdds(analysis.fighter2.odds)}
                      </Typography>
                    </Box>
                    <Avatar src={analysis.fighter2.avatar} sx={{ width: 32, height: 32 }}>
                      {analysis.fighter2.name.charAt(0)}
                    </Avatar>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Recommendation */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2} mb={2}>
                <Chip
                  icon={getRecommendationIcon(analysis.recommendation.type)}
                  label={analysis.recommendation.type.replace('_', ' ').toUpperCase()}
                  color={getRecommendationColor(analysis.recommendation.type) as any}
                  variant="filled"
                />
                <Typography variant="h6" color={`${getRecommendationColor(analysis.recommendation.type)}.main`}>
                  {analysis.recommendation.expectedValue > 0 ? '+' : ''}{analysis.recommendation.expectedValue.toFixed(1)}% EV
                </Typography>
              </Box>

              <Box mb={2}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Confidence Level
                </Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={analysis.recommendation.confidence} 
                  color={getRecommendationColor(analysis.recommendation.type) as any}
                  sx={{ height: 8, borderRadius: 4 }}
                />
                <Typography variant="caption" color="text.secondary">
                  {analysis.recommendation.confidence}%
                </Typography>
              </Box>

              <Typography variant="body2">
                {analysis.recommendation.reasoning[0]}
              </Typography>
            </CardContent>
          </Card>

          {/* Suggested Stake */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Suggested Stake
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Recommended
                  </Typography>
                  <Typography variant="h6" color="primary.main">
                    ${analysis.suggestedStake.amount}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {analysis.suggestedStake.percentage}% of bankroll
                  </Typography>
                </Grid>
                
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Maximum
                  </Typography>
                  <Typography variant="h6" color="warning.main">
                    ${analysis.suggestedStake.maxAmount}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Risk limit
                  </Typography>
                </Grid>
              </Grid>

              <Button
                variant="contained"
                fullWidth
                startIcon={<Calculate />}
                sx={{ mt: 2 }}
                onClick={() => {
                  // Open betting calculator with pre-filled values
                }}
              >
                Calculate Returns
              </Button>
            </CardContent>
          </Card>

          {/* Detailed Analysis Accordions */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="subtitle2">Key Factors</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {analysis.keyFactors.map((factor, index) => (
                <Box key={index} display="flex" alignItems="center" gap={2} mb={1}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: factor.impact === 'positive' ? 'success.main' : 
                               factor.impact === 'negative' ? 'error.main' : 'grey.400'
                    }}
                  />
                  <Typography variant="body2" flex={1}>
                    {factor.factor}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(factor.weight * 100).toFixed(0)}%
                  </Typography>
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="subtitle2">Risk Assessment</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box mb={2}>
                <Chip
                  label={`${analysis.riskAssessment.level.toUpperCase()} RISK`}
                  color={
                    analysis.riskAssessment.level === 'low' ? 'success' :
                    analysis.riskAssessment.level === 'medium' ? 'warning' : 'error'
                  }
                  size="small"
                />
              </Box>
              {analysis.riskAssessment.factors.map((factor, index) => (
                <Typography key={index} variant="body2" sx={{ mb: 1 }}>
                  • {factor}
                </Typography>
              ))}
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="subtitle2">Full Reasoning</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {analysis.recommendation.reasoning.map((reason, index) => (
                <Typography key={index} variant="body2" sx={{ mb: 1 }}>
                  {index + 1}. {reason}
                </Typography>
              ))}
            </AccordionDetails>
          </Accordion>
        </Box>
      )}

      {/* Empty State */}
      {!analysis && !loading && (
        <Box textAlign="center" py={4}>
          <Assessment sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Quick Bet Analysis
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Search for a fight above to get instant betting analysis with recommendations
          </Typography>
        </Box>
      )}
    </Box>
  );
};