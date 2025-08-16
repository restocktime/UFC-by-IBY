import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  InputAdornment,
  Alert,
  Skeleton,
} from '@mui/material';
import {
  Search,
  FilterList,
  Sort,
  ViewList,
  ViewModule,
  Refresh,
} from '@mui/icons-material';
import { Fight } from '@shared/types/fight';
import { Fighter } from '@shared/types/fighter';
import { PredictionResult } from '@shared/types/prediction';
import { Event } from '@shared/types/event';
import { WeightClass } from '@shared/types/core';
import { FightCard } from './FightCard';
import { PredictionDetails } from './PredictionDetails';
import { apiService } from '../../services/api';

interface FightWithDetails extends Fight {
  fighter1: Fighter;
  fighter2: Fighter;
  event: Event;
  prediction?: PredictionResult;
}

type SortOption = 'date' | 'confidence' | 'event' | 'weightClass';
type ViewMode = 'grid' | 'list';

interface FilterOptions {
  search: string;
  weightClass: WeightClass | 'all';
  titleFightsOnly: boolean;
  mainEventsOnly: boolean;
  minConfidence: number;
}

export function FightPredictionDashboard() {
  const [fights, setFights] = useState<FightWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFight, setSelectedFight] = useState<FightWithDetails | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  // Filter and sort state
  const [filters, setFilters] = useState<FilterOptions>({
    search: '',
    weightClass: 'all',
    titleFightsOnly: false,
    mainEventsOnly: false,
    minConfidence: 0,
  });
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Load fights data
  useEffect(() => {
    loadFights();
  }, []);

  const loadFights = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch upcoming fights with predictions
      const fightsData = await apiService.get<Fight[]>('/fights/upcoming');
      
      // Fetch detailed data for each fight
      const fightsWithDetails = await Promise.all(
        fightsData.map(async (fight) => {
          const [fighter1, fighter2, event, prediction] = await Promise.all([
            apiService.get<Fighter>(`/fighters/${fight.fighter1Id}`),
            apiService.get<Fighter>(`/fighters/${fight.fighter2Id}`),
            apiService.get<Event>(`/events/${fight.eventId}`),
            apiService.get<PredictionResult>(`/predictions/${fight.id}`).catch(() => null),
          ]);
          
          return {
            ...fight,
            fighter1,
            fighter2,
            event,
            prediction,
          };
        })
      );
      
      setFights(fightsWithDetails);
    } catch (err) {
      setError('Failed to load fight predictions. Please try again.');
      console.error('Error loading fights:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort fights
  const filteredAndSortedFights = useMemo(() => {
    let filtered = fights.filter((fight) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          fight.fighter1.name.toLowerCase().includes(searchLower) ||
          fight.fighter2.name.toLowerCase().includes(searchLower) ||
          fight.event.name.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Weight class filter
      if (filters.weightClass !== 'all' && fight.weightClass !== filters.weightClass) {
        return false;
      }

      // Title fights filter
      if (filters.titleFightsOnly && !fight.titleFight) {
        return false;
      }

      // Main events filter
      if (filters.mainEventsOnly && !fight.mainEvent) {
        return false;
      }

      // Confidence filter
      if (fight.prediction && fight.prediction.confidence < filters.minConfidence / 100) {
        return false;
      }

      return true;
    });

    // Sort fights
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(a.event.date).getTime() - new Date(b.event.date).getTime();
        case 'confidence':
          const aConf = a.prediction?.confidence || 0;
          const bConf = b.prediction?.confidence || 0;
          return bConf - aConf;
        case 'event':
          return a.event.name.localeCompare(b.event.name);
        case 'weightClass':
          return a.weightClass.localeCompare(b.weightClass);
        default:
          return 0;
      }
    });

    return filtered;
  }, [fights, filters, sortBy]);

  const handleFightClick = (fight: FightWithDetails) => {
    if (fight.prediction) {
      setSelectedFight(fight);
      setDetailsOpen(true);
    }
  };

  const handleFilterChange = (key: keyof FilterOptions, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      weightClass: 'all',
      titleFightsOnly: false,
      mainEventsOnly: false,
      minConfidence: 0,
    });
  };

  const weightClasses: WeightClass[] = [
    'Flyweight',
    'Bantamweight',
    'Featherweight',
    'Lightweight',
    'Welterweight',
    'Middleweight',
    'Light Heavyweight',
    'Heavyweight',
    'Women\'s Strawweight',
    'Women\'s Flyweight',
    'Women\'s Bantamweight',
    'Women\'s Featherweight',
  ];

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 4 }}>
          Fight Predictions
        </Typography>
        <Grid container spacing={3}>
          {[...Array(6)].map((_, index) => (
            <Grid item xs={12} md={6} lg={4} key={index}>
              <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 1 }} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" component="h1">
          Fight Predictions
        </Typography>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={loadFights}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Filters and Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            {/* Search */}
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                placeholder="Search fighters or events..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search />
                    </InputAdornment>
                  ),
                }}
                size="small"
              />
            </Grid>

            {/* Weight Class Filter */}
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Weight Class</InputLabel>
                <Select
                  value={filters.weightClass}
                  label="Weight Class"
                  onChange={(e) => handleFilterChange('weightClass', e.target.value)}
                >
                  <MenuItem value="all">All Classes</MenuItem>
                  {weightClasses.map((wc) => (
                    <MenuItem key={wc} value={wc}>
                      {wc}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Sort */}
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Sort By</InputLabel>
                <Select
                  value={sortBy}
                  label="Sort By"
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                >
                  <MenuItem value="date">Date</MenuItem>
                  <MenuItem value="confidence">Confidence</MenuItem>
                  <MenuItem value="event">Event</MenuItem>
                  <MenuItem value="weightClass">Weight Class</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Confidence Filter */}
            <Grid item xs={12} md={2}>
              <TextField
                fullWidth
                type="number"
                label="Min Confidence %"
                value={filters.minConfidence}
                onChange={(e) => handleFilterChange('minConfidence', Number(e.target.value))}
                inputProps={{ min: 0, max: 100 }}
                size="small"
              />
            </Grid>

            {/* View Mode */}
            <Grid item xs={12} md={1}>
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                onChange={(_, value) => value && setViewMode(value)}
                size="small"
              >
                <ToggleButton value="grid">
                  <ViewModule />
                </ToggleButton>
                <ToggleButton value="list">
                  <ViewList />
                </ToggleButton>
              </ToggleButtonGroup>
            </Grid>

            {/* Clear Filters */}
            <Grid item xs={12} md={2}>
              <Button
                variant="outlined"
                onClick={clearFilters}
                size="small"
                fullWidth
              >
                Clear Filters
              </Button>
            </Grid>
          </Grid>

          {/* Filter Chips */}
          <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {filters.titleFightsOnly && (
              <Chip
                label="Title Fights Only"
                onDelete={() => handleFilterChange('titleFightsOnly', false)}
                size="small"
              />
            )}
            {filters.mainEventsOnly && (
              <Chip
                label="Main Events Only"
                onDelete={() => handleFilterChange('mainEventsOnly', false)}
                size="small"
              />
            )}
            {filters.weightClass !== 'all' && (
              <Chip
                label={`${filters.weightClass} Only`}
                onDelete={() => handleFilterChange('weightClass', 'all')}
                size="small"
              />
            )}
            {filters.minConfidence > 0 && (
              <Chip
                label={`Min ${filters.minConfidence}% Confidence`}
                onDelete={() => handleFilterChange('minConfidence', 0)}
                size="small"
              />
            )}
          </Box>

          {/* Toggle Buttons */}
          <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
            <Button
              variant={filters.titleFightsOnly ? 'contained' : 'outlined'}
              onClick={() => handleFilterChange('titleFightsOnly', !filters.titleFightsOnly)}
              size="small"
            >
              Title Fights
            </Button>
            <Button
              variant={filters.mainEventsOnly ? 'contained' : 'outlined'}
              onClick={() => handleFilterChange('mainEventsOnly', !filters.mainEventsOnly)}
              size="small"
            >
              Main Events
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Results Summary */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="body1" color="text.secondary">
          Showing {filteredAndSortedFights.length} of {fights.length} upcoming fights
        </Typography>
      </Box>

      {/* Fight Cards */}
      {filteredAndSortedFights.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No fights found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Try adjusting your filters or check back later for new predictions.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {filteredAndSortedFights.map((fight) => (
            <Grid 
              item 
              xs={12} 
              md={viewMode === 'grid' ? 6 : 12} 
              lg={viewMode === 'grid' ? 4 : 12} 
              key={fight.id}
            >
              <FightCard
                fight={fight}
                fighter1={fight.fighter1}
                fighter2={fight.fighter2}
                event={fight.event}
                prediction={fight.prediction}
                onClick={() => handleFightClick(fight)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Prediction Details Modal */}
      {selectedFight && selectedFight.prediction && (
        <PredictionDetails
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          fight={selectedFight}
          fighter1={selectedFight.fighter1}
          fighter2={selectedFight.fighter2}
          event={selectedFight.event}
          prediction={selectedFight.prediction}
        />
      )}
    </Box>
  );
}