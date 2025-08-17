import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Button,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  Alert,
} from '@mui/material';
import {
  Add,
  Delete,
  Edit,
  Visibility,
  VisibilityOff,
  Star,
  StarBorder,
  TrendingUp,
  TrendingDown,
  Timeline,
  Notifications,
  NotificationsOff,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { apiService } from '../../services/api';

interface WatchlistItem {
  id: string;
  type: 'fighter' | 'fight' | 'event';
  name: string;
  description?: string;
  avatar?: string;
  data: {
    fighterId?: string;
    fightId?: string;
    eventId?: string;
    currentOdds?: {
      fighter1: number;
      fighter2: number;
      sportsbook: string;
    };
    lastOddsChange?: {
      timestamp: string;
      oldOdds: number;
      newOdds: number;
      percentageChange: number;
    };
    nextFight?: {
      opponent: string;
      date: string;
      event: string;
    };
  };
  alerts: {
    oddsMovement: boolean;
    fightAnnouncement: boolean;
    injuryNews: boolean;
    threshold?: number;
  };
  addedDate: string;
  lastUpdate: string;
}

interface Watchlist {
  id: string;
  name: string;
  description?: string;
  items: WatchlistItem[];
  isDefault: boolean;
  createdDate: string;
}

interface CustomWatchlistProps {
  autoRefresh: boolean;
  refreshInterval: number;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`watchlist-tabpanel-${index}`}
      aria-labelledby={`watchlist-tab-${index}`}
      {...other}
    >
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

export const CustomWatchlist: React.FC<CustomWatchlistProps> = ({
  autoRefresh,
  refreshInterval,
}) => {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeWatchlist, setActiveWatchlist] = useState<string>('');
  const [activeTab, setActiveTab] = useState(0);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [editItemDialogOpen, setEditItemDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WatchlistItem | null>(null);
  const [newWatchlistName, setNewWatchlistName] = useState('');
  const [newWatchlistDescription, setNewWatchlistDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWatchlists = useCallback(async () => {
    try {
      const response = await apiService.get<Watchlist[]>('/watchlists');
      setWatchlists(response);
      
      if (response.length > 0 && !activeWatchlist) {
        const defaultWatchlist = response.find(w => w.isDefault) || response[0];
        setActiveWatchlist(defaultWatchlist.id);
      }
    } catch (error) {
      console.error('Failed to fetch watchlists:', error);
    } finally {
      setLoading(false);
    }
  }, [activeWatchlist]);

  const updateWatchlistItems = useCallback(async () => {
    if (!activeWatchlist) return;
    
    try {
      const updatedItems = await apiService.get<WatchlistItem[]>(`/watchlists/${activeWatchlist}/items`);
      setWatchlists(prev => 
        prev.map(watchlist => 
          watchlist.id === activeWatchlist 
            ? { ...watchlist, items: updatedItems }
            : watchlist
        )
      );
    } catch (error) {
      console.error('Failed to update watchlist items:', error);
    }
  }, [activeWatchlist]);

  useEffect(() => {
    fetchWatchlists();
  }, [fetchWatchlists]);

  useEffect(() => {
    if (autoRefresh && activeWatchlist) {
      const interval = setInterval(updateWatchlistItems, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, updateWatchlistItems]);

  const createWatchlist = async () => {
    try {
      const newWatchlist = await apiService.post<Watchlist>('/watchlists', {
        name: newWatchlistName,
        description: newWatchlistDescription,
      });
      setWatchlists(prev => [...prev, newWatchlist]);
      setActiveWatchlist(newWatchlist.id);
      setCreateDialogOpen(false);
      setNewWatchlistName('');
      setNewWatchlistDescription('');
    } catch (error) {
      console.error('Failed to create watchlist:', error);
    }
  };

  const deleteWatchlist = async (watchlistId: string) => {
    try {
      await apiService.delete(`/watchlists/${watchlistId}`);
      setWatchlists(prev => prev.filter(w => w.id !== watchlistId));
      
      if (activeWatchlist === watchlistId) {
        const remaining = watchlists.filter(w => w.id !== watchlistId);
        setActiveWatchlist(remaining.length > 0 ? remaining[0].id : '');
      }
    } catch (error) {
      console.error('Failed to delete watchlist:', error);
    }
  };

  const searchItems = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const results = await apiService.get('/search', {
        params: { q: query, types: 'fighter,fight,event' }
      });
      setSearchResults(results);
    } catch (error) {
      console.error('Failed to search items:', error);
    }
  };

  const addItemToWatchlist = async (item: any) => {
    try {
      const newItem = await apiService.post<WatchlistItem>(`/watchlists/${activeWatchlist}/items`, {
        type: item.type,
        name: item.name,
        data: item,
        alerts: {
          oddsMovement: true,
          fightAnnouncement: true,
          injuryNews: false,
          threshold: 5,
        },
      });
      
      setWatchlists(prev => 
        prev.map(watchlist => 
          watchlist.id === activeWatchlist 
            ? { ...watchlist, items: [...watchlist.items, newItem] }
            : watchlist
        )
      );
      
      setAddItemDialogOpen(false);
      setSearchQuery('');
      setSearchResults([]);
    } catch (error) {
      console.error('Failed to add item to watchlist:', error);
    }
  };

  const removeItemFromWatchlist = async (itemId: string) => {
    try {
      await apiService.delete(`/watchlists/${activeWatchlist}/items/${itemId}`);
      
      setWatchlists(prev => 
        prev.map(watchlist => 
          watchlist.id === activeWatchlist 
            ? { ...watchlist, items: watchlist.items.filter(item => item.id !== itemId) }
            : watchlist
        )
      );
    } catch (error) {
      console.error('Failed to remove item from watchlist:', error);
    }
  };

  const updateItemAlerts = async (itemId: string, alerts: WatchlistItem['alerts']) => {
    try {
      await apiService.patch(`/watchlists/${activeWatchlist}/items/${itemId}`, { alerts });
      
      setWatchlists(prev => 
        prev.map(watchlist => 
          watchlist.id === activeWatchlist 
            ? { 
                ...watchlist, 
                items: watchlist.items.map(item => 
                  item.id === itemId ? { ...item, alerts } : item
                )
              }
            : watchlist
        )
      );
      
      setEditItemDialogOpen(false);
    } catch (error) {
      console.error('Failed to update item alerts:', error);
    }
  };

  const formatOdds = (odds: number): string => {
    return odds > 0 ? `+${odds}` : `${odds}`;
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp color="success" />;
    if (change < 0) return <TrendingDown color="error" />;
    return <Timeline color="disabled" />;
  };

  const currentWatchlist = watchlists.find(w => w.id === activeWatchlist);

  if (loading) {
    return <Box>Loading watchlists...</Box>;
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" component="h2">
          Custom Watchlists
        </Typography>
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            startIcon={<Add />}
            onClick={() => setAddItemDialogOpen(true)}
            disabled={!activeWatchlist}
          >
            Add Item
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setCreateDialogOpen(true)}
          >
            New Watchlist
          </Button>
        </Box>
      </Box>

      {watchlists.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Star sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No Watchlists Created
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Create your first watchlist to track fighters, fights, and events
          </Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create Watchlist
          </Button>
        </Paper>
      ) : (
        <>
          {/* Watchlist Tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
            <Tabs 
              value={activeTab} 
              onChange={(e, newValue) => setActiveTab(newValue)}
              variant="scrollable"
              scrollButtons="auto"
            >
              {watchlists.map((watchlist, index) => (
                <Tab
                  key={watchlist.id}
                  label={
                    <Box display="flex" alignItems="center" gap={1}>
                      {watchlist.isDefault && <Star fontSize="small" />}
                      {watchlist.name}
                      <Chip size="small" label={watchlist.items.length} />
                    </Box>
                  }
                  onClick={() => setActiveWatchlist(watchlist.id)}
                />
              ))}
            </Tabs>
          </Box>

          {/* Watchlist Content */}
          {currentWatchlist && (
            <Box>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Box>
                  <Typography variant="h6">{currentWatchlist.name}</Typography>
                  {currentWatchlist.description && (
                    <Typography variant="body2" color="text.secondary">
                      {currentWatchlist.description}
                    </Typography>
                  )}
                </Box>
                {!currentWatchlist.isDefault && (
                  <IconButton
                    color="error"
                    onClick={() => deleteWatchlist(currentWatchlist.id)}
                  >
                    <Delete />
                  </IconButton>
                )}
              </Box>

              {currentWatchlist.items.length === 0 ? (
                <Alert severity="info">
                  This watchlist is empty. Add fighters, fights, or events to start tracking.
                </Alert>
              ) : (
                <Grid container spacing={3}>
                  {currentWatchlist.items.map((item) => (
                    <Grid item xs={12} md={6} lg={4} key={item.id}>
                      <Card>
                        <CardContent>
                          <Box display="flex" alignItems="center" gap={2} mb={2}>
                            <Avatar src={item.avatar} alt={item.name}>
                              {item.name.charAt(0)}
                            </Avatar>
                            <Box flex={1}>
                              <Typography variant="subtitle1" fontWeight="bold">
                                {item.name}
                              </Typography>
                              <Chip
                                label={item.type}
                                size="small"
                                color="primary"
                                variant="outlined"
                              />
                            </Box>
                            <IconButton
                              size="small"
                              onClick={() => {
                                setSelectedItem(item);
                                setEditItemDialogOpen(true);
                              }}
                            >
                              <Edit fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => removeItemFromWatchlist(item.id)}
                            >
                              <Delete fontSize="small" />
                            </IconButton>
                          </Box>

                          {item.description && (
                            <Typography variant="body2" color="text.secondary" mb={2}>
                              {item.description}
                            </Typography>
                          )}

                          {/* Current Odds */}
                          {item.data.currentOdds && (
                            <Box mb={2}>
                              <Typography variant="caption" color="text.secondary">
                                Current Odds ({item.data.currentOdds.sportsbook})
                              </Typography>
                              <Typography variant="body2">
                                {formatOdds(item.data.currentOdds.fighter1)} / {formatOdds(item.data.currentOdds.fighter2)}
                              </Typography>
                            </Box>
                          )}

                          {/* Last Odds Change */}
                          {item.data.lastOddsChange && (
                            <Box mb={2}>
                              <Box display="flex" alignItems="center" gap={1}>
                                {getChangeIcon(item.data.lastOddsChange.percentageChange)}
                                <Typography variant="caption" color="text.secondary">
                                  Last Change: {item.data.lastOddsChange.percentageChange > 0 ? '+' : ''}{item.data.lastOddsChange.percentageChange.toFixed(1)}%
                                </Typography>
                              </Box>
                              <Typography variant="caption" color="text.secondary">
                                {format(new Date(item.data.lastOddsChange.timestamp), 'MMM dd, HH:mm')}
                              </Typography>
                            </Box>
                          )}

                          {/* Next Fight */}
                          {item.data.nextFight && (
                            <Box mb={2}>
                              <Typography variant="caption" color="text.secondary">
                                Next Fight
                              </Typography>
                              <Typography variant="body2">
                                vs {item.data.nextFight.opponent}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {format(new Date(item.data.nextFight.date), 'MMM dd, yyyy')} - {item.data.nextFight.event}
                              </Typography>
                            </Box>
                          )}

                          {/* Alert Status */}
                          <Box display="flex" alignItems="center" gap={1}>
                            {item.alerts.oddsMovement || item.alerts.fightAnnouncement || item.alerts.injuryNews ? (
                              <Notifications color="primary" fontSize="small" />
                            ) : (
                              <NotificationsOff color="disabled" fontSize="small" />
                            )}
                            <Typography variant="caption" color="text.secondary">
                              {item.alerts.oddsMovement || item.alerts.fightAnnouncement || item.alerts.injuryNews 
                                ? 'Alerts enabled' 
                                : 'No alerts'
                              }
                            </Typography>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>
          )}
        </>
      )}

      {/* Create Watchlist Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Watchlist</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Watchlist Name"
            fullWidth
            variant="outlined"
            value={newWatchlistName}
            onChange={(e) => setNewWatchlistName(e.target.value)}
          />
          <TextField
            margin="dense"
            label="Description (optional)"
            fullWidth
            variant="outlined"
            multiline
            rows={3}
            value={newWatchlistDescription}
            onChange={(e) => setNewWatchlistDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={createWatchlist} 
            variant="contained"
            disabled={!newWatchlistName.trim()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={addItemDialogOpen} onClose={() => setAddItemDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Add Item to Watchlist</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Search fighters, fights, or events"
            fullWidth
            variant="outlined"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              searchItems(e.target.value);
            }}
          />
          
          {searchResults.length > 0 && (
            <List sx={{ mt: 2 }}>
              {searchResults.map((result, index) => (
                <ListItem key={index} divider>
                  <Avatar src={result.avatar} sx={{ mr: 2 }}>
                    {result.name.charAt(0)}
                  </Avatar>
                  <ListItemText
                    primary={result.name}
                    secondary={`${result.type} ${result.description ? `- ${result.description}` : ''}`}
                  />
                  <ListItemSecondaryAction>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => addItemToWatchlist(result)}
                    >
                      Add
                    </Button>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddItemDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog open={editItemDialogOpen} onClose={() => setEditItemDialogOpen(false)} maxWidth="sm" fullWidth>
        {selectedItem && (
          <>
            <DialogTitle>Edit Alert Settings - {selectedItem.name}</DialogTitle>
            <DialogContent>
              <Box py={2}>
                <Typography variant="subtitle2" gutterBottom>
                  Alert Types
                </Typography>
                
                <List>
                  <ListItem>
                    <ListItemText primary="Odds Movement" secondary="Alert when odds change significantly" />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        onClick={() => {
                          const newAlerts = {
                            ...selectedItem.alerts,
                            oddsMovement: !selectedItem.alerts.oddsMovement
                          };
                          updateItemAlerts(selectedItem.id, newAlerts);
                        }}
                      >
                        {selectedItem.alerts.oddsMovement ? <Notifications /> : <NotificationsOff />}
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                  
                  <ListItem>
                    <ListItemText primary="Fight Announcements" secondary="Alert for new fight bookings" />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        onClick={() => {
                          const newAlerts = {
                            ...selectedItem.alerts,
                            fightAnnouncement: !selectedItem.alerts.fightAnnouncement
                          };
                          updateItemAlerts(selectedItem.id, newAlerts);
                        }}
                      >
                        {selectedItem.alerts.fightAnnouncement ? <Notifications /> : <NotificationsOff />}
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                  
                  <ListItem>
                    <ListItemText primary="Injury News" secondary="Alert for injury reports" />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        onClick={() => {
                          const newAlerts = {
                            ...selectedItem.alerts,
                            injuryNews: !selectedItem.alerts.injuryNews
                          };
                          updateItemAlerts(selectedItem.id, newAlerts);
                        }}
                      >
                        {selectedItem.alerts.injuryNews ? <Notifications /> : <NotificationsOff />}
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                </List>

                <TextField
                  label="Odds Movement Threshold (%)"
                  type="number"
                  value={selectedItem.alerts.threshold || 5}
                  onChange={(e) => {
                    const newAlerts = {
                      ...selectedItem.alerts,
                      threshold: parseFloat(e.target.value)
                    };
                    setSelectedItem({ ...selectedItem, alerts: newAlerts });
                  }}
                  fullWidth
                  margin="normal"
                  inputProps={{ min: 1, max: 50, step: 0.5 }}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setEditItemDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => updateItemAlerts(selectedItem.id, selectedItem.alerts)}
                variant="contained"
              >
                Save Settings
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};