import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Tabs,
  Tab,
  Divider,
  Chip,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Calculate,
  TrendingUp,
  MonetizationOn,
  Percent,
  Clear,
  ContentCopy,
  Share,
} from '@mui/icons-material';

interface CalculationResult {
  profit: number;
  totalReturn: number;
  roi: number;
  impliedProbability: number;
  breakEvenOdds: number;
}

interface ArbitrageResult {
  profit: number;
  profitPercentage: number;
  stake1: number;
  stake2: number;
  totalStake: number;
  isArbitrage: boolean;
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
      id={`calculator-tabpanel-${index}`}
      aria-labelledby={`calculator-tab-${index}`}
      {...other}
    >
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

export const BettingCalculator: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  
  // Single Bet Calculator
  const [stake, setStake] = useState<string>('');
  const [odds, setOdds] = useState<string>('');
  const [oddsFormat, setOddsFormat] = useState<'american' | 'decimal' | 'fractional'>('american');
  const [result, setResult] = useState<CalculationResult | null>(null);
  
  // Arbitrage Calculator
  const [odds1, setOdds1] = useState<string>('');
  const [odds2, setOdds2] = useState<string>('');
  const [totalStake, setTotalStake] = useState<string>('');
  const [arbitrageResult, setArbitrageResult] = useState<ArbitrageResult | null>(null);
  
  // Kelly Criterion
  const [winProbability, setWinProbability] = useState<string>('');
  const [bankroll, setBankroll] = useState<string>('1000');
  const [kellyStake, setKellyStake] = useState<number | null>(null);
  
  // Settings
  const [autoCalculate, setAutoCalculate] = useState(true);

  const convertOddsToDecimal = (oddsValue: string, format: string): number => {
    const num = parseFloat(oddsValue);
    if (isNaN(num)) return 0;
    
    switch (format) {
      case 'american':
        return num > 0 ? (num / 100) + 1 : (100 / Math.abs(num)) + 1;
      case 'decimal':
        return num;
      case 'fractional':
        // Assuming format like "5/2" or "2.5"
        if (oddsValue.includes('/')) {
          const [numerator, denominator] = oddsValue.split('/').map(Number);
          return (numerator / denominator) + 1;
        }
        return num + 1;
      default:
        return num;
    }
  };

  const convertDecimalToAmerican = (decimal: number): number => {
    if (decimal >= 2) {
      return (decimal - 1) * 100;
    } else {
      return -100 / (decimal - 1);
    }
  };

  const calculateSingleBet = () => {
    const stakeAmount = parseFloat(stake);
    const decimalOdds = convertOddsToDecimal(odds, oddsFormat);
    
    if (isNaN(stakeAmount) || stakeAmount <= 0 || decimalOdds <= 1) {
      setResult(null);
      return;
    }
    
    const profit = stakeAmount * (decimalOdds - 1);
    const totalReturn = stakeAmount * decimalOdds;
    const roi = (profit / stakeAmount) * 100;
    const impliedProbability = (1 / decimalOdds) * 100;
    const breakEvenOdds = convertDecimalToAmerican(1 / (impliedProbability / 100));
    
    setResult({
      profit,
      totalReturn,
      roi,
      impliedProbability,
      breakEvenOdds,
    });
  };

  const calculateArbitrage = () => {
    const decimal1 = convertOddsToDecimal(odds1, oddsFormat);
    const decimal2 = convertOddsToDecimal(odds2, oddsFormat);
    const totalStakeAmount = parseFloat(totalStake);
    
    if (decimal1 <= 1 || decimal2 <= 1 || isNaN(totalStakeAmount) || totalStakeAmount <= 0) {
      setArbitrageResult(null);
      return;
    }
    
    const impliedProb1 = 1 / decimal1;
    const impliedProb2 = 1 / decimal2;
    const totalImpliedProb = impliedProb1 + impliedProb2;
    
    const isArbitrage = totalImpliedProb < 1;
    
    if (isArbitrage) {
      const stake1 = (totalStakeAmount * impliedProb1) / totalImpliedProb;
      const stake2 = (totalStakeAmount * impliedProb2) / totalImpliedProb;
      const profit1 = stake1 * decimal1 - totalStakeAmount;
      const profit2 = stake2 * decimal2 - totalStakeAmount;
      const profit = Math.min(profit1, profit2);
      const profitPercentage = (profit / totalStakeAmount) * 100;
      
      setArbitrageResult({
        profit,
        profitPercentage,
        stake1,
        stake2,
        totalStake: totalStakeAmount,
        isArbitrage: true,
      });
    } else {
      setArbitrageResult({
        profit: 0,
        profitPercentage: 0,
        stake1: 0,
        stake2: 0,
        totalStake: totalStakeAmount,
        isArbitrage: false,
      });
    }
  };

  const calculateKelly = () => {
    const prob = parseFloat(winProbability) / 100;
    const decimalOdds = convertOddsToDecimal(odds, oddsFormat);
    const bankrollAmount = parseFloat(bankroll);
    
    if (isNaN(prob) || isNaN(decimalOdds) || isNaN(bankrollAmount) || 
        prob <= 0 || prob >= 1 || decimalOdds <= 1 || bankrollAmount <= 0) {
      setKellyStake(null);
      return;
    }
    
    const b = decimalOdds - 1; // Net odds received
    const q = 1 - prob; // Probability of losing
    
    const kellyFraction = (b * prob - q) / b;
    const kellyAmount = Math.max(0, kellyFraction * bankrollAmount);
    
    setKellyStake(kellyAmount);
  };

  const clearAll = () => {
    setStake('');
    setOdds('');
    setOdds1('');
    setOdds2('');
    setTotalStake('');
    setWinProbability('');
    setResult(null);
    setArbitrageResult(null);
    setKellyStake(null);
  };

  const copyResult = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const shareResult = async (text: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Betting Calculator Result',
          text: text,
        });
      } catch (error) {
        console.error('Failed to share:', error);
      }
    }
  };

  useEffect(() => {
    if (autoCalculate) {
      if (activeTab === 0) {
        calculateSingleBet();
      } else if (activeTab === 1) {
        calculateArbitrage();
      } else if (activeTab === 2) {
        calculateKelly();
      }
    }
  }, [stake, odds, odds1, odds2, totalStake, winProbability, bankroll, oddsFormat, autoCalculate, activeTab]);

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">
          Betting Calculator
        </Typography>
        <Box>
          <Tooltip title="Clear all">
            <IconButton size="small" onClick={clearAll}>
              <Clear />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Settings */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ py: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={6}>
              <FormControl size="small" fullWidth>
                <InputLabel>Odds Format</InputLabel>
                <Select
                  value={oddsFormat}
                  onChange={(e) => setOddsFormat(e.target.value as any)}
                  label="Odds Format"
                >
                  <MenuItem value="american">American (+/-)</MenuItem>
                  <MenuItem value="decimal">Decimal</MenuItem>
                  <MenuItem value="fractional">Fractional</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={autoCalculate}
                    onChange={(e) => setAutoCalculate(e.target.checked)}
                    size="small"
                  />
                }
                label="Auto Calculate"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs 
        value={activeTab} 
        onChange={(e, newValue) => setActiveTab(newValue)}
        variant="fullWidth"
        sx={{ mb: 2 }}
      >
        <Tab label="Single Bet" />
        <Tab label="Arbitrage" />
        <Tab label="Kelly" />
      </Tabs>

      {/* Single Bet Calculator */}
      <TabPanel value={activeTab} index={0}>
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField
              label="Stake ($)"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              fullWidth
              size="small"
              type="number"
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              label={`Odds (${oddsFormat})`}
              value={odds}
              onChange={(e) => setOdds(e.target.value)}
              fullWidth
              size="small"
            />
          </Grid>
        </Grid>

        {!autoCalculate && (
          <Button
            variant="contained"
            fullWidth
            startIcon={<Calculate />}
            onClick={calculateSingleBet}
            sx={{ mt: 2 }}
          >
            Calculate
          </Button>
        )}

        {result && (
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Results
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Profit
                  </Typography>
                  <Typography variant="h6" color="success.main">
                    ${result.profit.toFixed(2)}
                  </Typography>
                </Grid>
                
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Total Return
                  </Typography>
                  <Typography variant="h6" color="primary.main">
                    ${result.totalReturn.toFixed(2)}
                  </Typography>
                </Grid>
                
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    ROI
                  </Typography>
                  <Typography variant="body1">
                    {result.roi.toFixed(1)}%
                  </Typography>
                </Grid>
                
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Implied Probability
                  </Typography>
                  <Typography variant="body1">
                    {result.impliedProbability.toFixed(1)}%
                  </Typography>
                </Grid>
              </Grid>

              <Box display="flex" gap={1} mt={2}>
                <Button
                  size="small"
                  startIcon={<ContentCopy />}
                  onClick={() => copyResult(`Profit: $${result.profit.toFixed(2)}, ROI: ${result.roi.toFixed(1)}%`)}
                >
                  Copy
                </Button>
                <Button
                  size="small"
                  startIcon={<Share />}
                  onClick={() => shareResult(`Profit: $${result.profit.toFixed(2)}, ROI: ${result.roi.toFixed(1)}%`)}
                >
                  Share
                </Button>
              </Box>
            </CardContent>
          </Card>
        )}
      </TabPanel>

      {/* Arbitrage Calculator */}
      <TabPanel value={activeTab} index={1}>
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField
              label="Odds 1"
              value={odds1}
              onChange={(e) => setOdds1(e.target.value)}
              fullWidth
              size="small"
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              label="Odds 2"
              value={odds2}
              onChange={(e) => setOdds2(e.target.value)}
              fullWidth
              size="small"
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Total Stake ($)"
              value={totalStake}
              onChange={(e) => setTotalStake(e.target.value)}
              fullWidth
              size="small"
              type="number"
            />
          </Grid>
        </Grid>

        {!autoCalculate && (
          <Button
            variant="contained"
            fullWidth
            startIcon={<Calculate />}
            onClick={calculateArbitrage}
            sx={{ mt: 2 }}
          >
            Calculate Arbitrage
          </Button>
        )}

        {arbitrageResult && (
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <Typography variant="subtitle1">
                  Arbitrage Analysis
                </Typography>
                <Chip
                  label={arbitrageResult.isArbitrage ? 'OPPORTUNITY' : 'NO ARBITRAGE'}
                  color={arbitrageResult.isArbitrage ? 'success' : 'error'}
                  size="small"
                />
              </Box>
              
              {arbitrageResult.isArbitrage ? (
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Guaranteed Profit
                    </Typography>
                    <Typography variant="h6" color="success.main">
                      ${arbitrageResult.profit.toFixed(2)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {arbitrageResult.profitPercentage.toFixed(2)}%
                    </Typography>
                  </Grid>
                  
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Stakes Required
                    </Typography>
                    <Typography variant="body2">
                      Bet 1: ${arbitrageResult.stake1.toFixed(2)}
                    </Typography>
                    <Typography variant="body2">
                      Bet 2: ${arbitrageResult.stake2.toFixed(2)}
                    </Typography>
                  </Grid>
                </Grid>
              ) : (
                <Alert severity="info">
                  No arbitrage opportunity exists with these odds.
                </Alert>
              )}
            </CardContent>
          </Card>
        )}
      </TabPanel>

      {/* Kelly Criterion Calculator */}
      <TabPanel value={activeTab} index={2}>
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField
              label="Win Probability (%)"
              value={winProbability}
              onChange={(e) => setWinProbability(e.target.value)}
              fullWidth
              size="small"
              type="number"
              inputProps={{ min: 0, max: 100 }}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              label={`Odds (${oddsFormat})`}
              value={odds}
              onChange={(e) => setOdds(e.target.value)}
              fullWidth
              size="small"
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Bankroll ($)"
              value={bankroll}
              onChange={(e) => setBankroll(e.target.value)}
              fullWidth
              size="small"
              type="number"
            />
          </Grid>
        </Grid>

        {!autoCalculate && (
          <Button
            variant="contained"
            fullWidth
            startIcon={<Calculate />}
            onClick={calculateKelly}
            sx={{ mt: 2 }}
          >
            Calculate Kelly
          </Button>
        )}

        {kellyStake !== null && (
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Kelly Criterion Result
              </Typography>
              
              <Typography variant="h5" color="primary.main" gutterBottom>
                ${kellyStake.toFixed(2)}
              </Typography>
              
              <Typography variant="body2" color="text.secondary">
                Recommended stake: {((kellyStake / parseFloat(bankroll)) * 100).toFixed(1)}% of bankroll
              </Typography>
              
              {kellyStake === 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Kelly Criterion suggests not betting on this opportunity.
                </Alert>
              )}
              
              {kellyStake > parseFloat(bankroll) * 0.25 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Suggested stake is high. Consider reducing for risk management.
                </Alert>
              )}
            </CardContent>
          </Card>
        )}
      </TabPanel>
    </Box>
  );
};