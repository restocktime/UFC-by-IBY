import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Button,
  IconButton,
  SwipeableDrawer,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  Divider,
  Alert,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  Search,
  TrendingUp,
  TrendingDown,
  Timeline,
  Refresh,
  FilterList,
  Sort,
  Bookmark,
  BookmarkBorder,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { apiService } from '../../services/api';

interface OddsComparison {
  fightId: string;
  fighter1: {
    name: string;
    avatar?: string;
  };
  fighter2: {
    name: string;
    avatar?: string;
  };
  event: string;
  date: string;
  sportsbooks: {
    name: string;
    fighter1Odds: number;
    fighter2Odds: number;
    lastUpdate: string;
    isAvailable: boolean;
  }[];
  bestOdds: {
    fighter1: {
      sportsbook: string;
      odds: number;
    };
    fighter2: {
      sportsbook: string;
      odds: number;
    };
  };
  arbitrageOpportunity?: {
    profit: number;
    stake1: number;
    stake2: number;
  };
}

export const MobileOddsComparison: React.FC = () => {
  const [comparisons, setComparisons] = useState<OddsComparison[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'event' | 'arbitrage' | 'bestOdds'>('event');
  const [bookmarkedFights, setBookmarkedFights] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOddsComparisons();
    loadBookmarks();
  }, []);

  const fetchOddsComparisons = async () => {
    try {
      const response = await apiService.get<OddsComparison[]>('/odds/compare');
      setComparisons(response);
    } catch (error) {
      console.error('Failed to fetch odds comparisons:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBookmarks = () => {
    const saved = localStorage.getItem('bookmarkedFights');
    if (saved) {
      setBookmarkedFights(JSON.parse(saved));
    }
  };

  const toggleBookmark = (fightId: string) => {
    const updated = bookmarkedFights.includes(fightId)
      ? bookmarkedFights.filter(id => id !== fightId)
      : [...bookmarkedFights, fightId];
    
    setBookmarkedFights(updated);
    localStorage.setItem('bookmarkedFights', JSON.stringify(updated));
  };

  const formatOdds = (odds: number): string => {
    return odds > 0 ? `+${odds}` : `${odds}`;
  };

  const getBestOddsColor = (sportsbook: string, bestSportsbook: string) => {
    return sportsbook === bestSportsbook ? 'success.main' : 'text.primary';
  };

  const filteredComparisons = comparisons.filter(comparison =>
    comparison.fighter1.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    comparison.fighter2.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    comparison.event.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedComparisons = [...filteredComparisons].sort((a, b) => {
    switch (sortBy) {
      case 'arbitrage':
        const aArb = a.arbitrageOpportunity?.profit || 0;
        const bArb = b.arbitrageOpportunity?.profit || 0;
        return bArb - aArb;
      case 'bestOdds':
        const aOdds = Math.max(a.bestOdds.fighter1.odds, a.bestOdds.fighter2.odds);
        const bOdds = Math.max(b.bestOdds.fighter1.odds, b.bestOdds.fighter2.odds);
        return bOdds - aOdds;
      default:
        return new Date(a.date).getTime() - new Date(b.date).getTime();
    }
  });

  if (loading) {
    return <Box>Loading odds comparisons...</Box>;
  }

  return (
    <Box>
      {/* Search and Filter */}
      <Box mb={2}>
        <TextField
          fullWidth
          placeholder="Search fights..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setFilterDrawerOpen(true)}>
                  <FilterList />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Quick Actions */}
      <Box display="flex" gap={1} mb={2}>
        <Button
          size="small"
          variant={sortBy === 'arbitrage' ? 'contained' : 'outlined'}
          onClick={() => setSortBy('arbitrage')}
        >
          Arbitrage
        </Button>
        <Button
          size="small"
          variant={sortBy === 'bestOdds' ? 'contained' : 'outlined'}
          onClick={() => setSortBy('bestOdds')}
        >
          Best Odds
        </Button>
        <Button
          size="small"
          startIcon={<Refresh />}
          onClick={fetchOddsComparisons}
        >
          Refresh
        </Button>
      </Box>

      {/* Odds Comparisons */}
      {sortedComparisons.length === 0 ? (
        <Alert severity="info">
          No fights found matching your search criteria.
        </Alert>
      ) : (
        <Box>
          {sortedComparisons.map((comparison) => (
            <Card key={comparison.fightId} sx={{ mb: 2 }}>
              <CardContent sx={{ pb: 1 }}>
                {/* Fight Header */}
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Box flex={1}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {comparison.fighter1.name} vs {comparison.fighter2.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {comparison.event} • {format(new Date(comparison.date), 'MMM dd')}
                    </Typography>
                  </Box>
                  
                  <Box display="flex" alignItems="center" gap={1}>
                    {comparison.arbitrageOpportunity && (
                      <Chip
                        label={`${comparison.arbitrageOpportunity.profit.toFixed(1)}% profit`}
                        color="success"
                        size="small"
                      />
                    )}
                    <IconButton
                      size="small"
                      onClick={() => toggleBookmark(comparison.fightId)}
                    >
                      {bookmarkedFights.includes(comparison.fightId) ? (
                        <Bookmark color="primary" />
                      ) : (
                        <BookmarkBorder />
                      )}
                    </IconButton>
                  </Box>
                </Box>

                {/* Best Odds Highlight */}
                <Box mb={2} p={1} bgcolor="grey.50" borderRadius={1}>
                  <Typography variant="caption" color="text.secondary" gutterBottom>
                    Best Odds Available
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" fontWeight="bold">
                        {comparison.fighter1.name}
                      </Typography>
                      <Typography variant="h6" color="success.main">
                        {formatOdds(comparison.bestOdds.fighter1.odds)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        @ {comparison.bestOdds.fighter1.sportsbook}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} textAlign="right">
                      <Typography variant="body2" fontWeight="bold">
                        {comparison.fighter2.name}
                      </Typography>
                      <Typography variant="h6" color="success.main">
                        {formatOdds(comparison.bestOdds.fighter2.odds)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        @ {comparison.bestOdds.fighter2.sportsbook}
                      </Typography>
                    </Grid>
                  </Grid>
                </Box>

                {/* Sportsbook Comparison */}
                <Typography variant="caption" color="text.secondary" gutterBottom>
                  All Sportsbooks
                </Typography>
                <Box>
                  {comparison.sportsbooks.map((sportsbook, index) => (
                    <Box key={index} mb={1}>
                      <Grid container spacing={1} alignItems="center">
                        <Grid item xs={4}>
                          <Typography variant="caption" fontWeight="bold">
                            {sportsbook.name}
                          </Typography>
                          {!sportsbook.isAvailable && (
                            <Chip label="N/A" size="small" color="default" sx={{ ml: 0.5 }} />
                          )}
                        </Grid>
                        <Grid item xs={4} textAlign="center">
                          <Typography
                            variant="body2"
                            color={getBestOddsColor(sportsbook.name, comparison.bestOdds.fighter1.sportsbook)}
                            fontWeight={sportsbook.name === comparison.bestOdds.fighter1.sportsbook ? 'bold' : 'normal'}
                          >
                            {sportsbook.isAvailable ? formatOdds(sportsbook.fighter1Odds) : '-'}
                          </Typography>
                        </Grid>
                        <Grid item xs={4} textAlign="right">
                          <Typography
                            variant="body2"
                            color={getBestOddsColor(sportsbook.name, comparison.bestOdds.fighter2.sportsbook)}
                            fontWeight={sportsbook.name === comparison.bestOdds.fighter2.sportsbook ? 'bold' : 'normal'}
                          >
                            {sportsbook.isAvailable ? formatOdds(sportsbook.fighter2Odds) : '-'}
                          </Typography>
                        </Grid>
                      </Grid>
                      {index < comparison.sportsbooks.length - 1 && <Divider sx={{ my: 0.5 }} />}
                    </Box>
                  ))}
                </Box>

                {/* Arbitrage Details */}
                {comparison.arbitrageOpportunity && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    <Typography variant="caption" fontWeight="bold">
                      Arbitrage Opportunity: {comparison.arbitrageOpportunity.profit.toFixed(2)}% profit
                    </Typography>
                    <Typography variant="caption" display="block">
                      Stake ${comparison.arbitrageOpportunity.stake1.toFixed(0)} on {comparison.fighter1.name} @ {comparison.bestOdds.fighter1.sportsbook}
                    </Typography>
                    <Typography variant="caption" display="block">
                      Stake ${comparison.arbitrageOpportunity.stake2.toFixed(0)} on {comparison.fighter2.name} @ {comparison.bestOdds.fighter2.sportsbook}
                    </Typography>
                  </Alert>
                )}

                {/* Last Update */}
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Last updated: {format(new Date(comparison.sportsbooks[0]?.lastUpdate || Date.now()), 'HH:mm:ss')}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Filter Drawer */}
      <SwipeableDrawer
        anchor="bottom"
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        onOpen={() => setFilterDrawerOpen(true)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: '50vh',
          }
        }}
      >
        <Box p={2}>
          <Typography variant="h6" gutterBottom>
            Sort & Filter
          </Typography>
          
          <Typography variant="subtitle2" gutterBottom>
            Sort By
          </Typography>
          <List>
            <ListItem button onClick={() => setSortBy('event')}>
              <ListItemText primary="Event Date" />
              <ListItemSecondaryAction>
                {sortBy === 'event' && <Chip label="Active" size="small" />}
              </ListItemSecondaryAction>
            </ListItem>
            
            <ListItem button onClick={() => setSortBy('arbitrage')}>
              <ListItemText primary="Arbitrage Profit" />
              <ListItemSecondaryAction>
                {sortBy === 'arbitrage' && <Chip label="Active" size="small" />}
              </ListItemSecondaryAction>
            </ListItem>
            
            <ListItem button onClick={() => setSortBy('bestOdds')}>
              <ListItemText primary="Best Odds" />
              <ListItemSecondaryAction>
                {sortBy === 'bestOdds' && <Chip label="Active" size="small" />}
              </ListItemSecondaryAction>
            </ListItem>
          </List>
          
          <Button
            fullWidth
            variant="contained"
            onClick={() => setFilterDrawerOpen(false)}
            sx={{ mt: 2 }}
          >
            Apply
          </Button>
        </Box>
      </SwipeableDrawer>
    </Box>
  );
};