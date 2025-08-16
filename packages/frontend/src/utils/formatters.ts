import { format, formatDistanceToNow, parseISO } from 'date-fns';

// Number formatters
export const formatNumber = (value: number, decimals = 0): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

export const formatPercentage = (value: number, decimals = 1): string => {
  return `${formatNumber(value, decimals)}%`;
};

export const formatCurrency = (value: number, currency = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(value);
};

// Date formatters
export const formatDate = (date: string | Date, formatString = 'MMM dd, yyyy'): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, formatString);
};

export const formatDateTime = (date: string | Date): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'MMM dd, yyyy HH:mm');
};

export const formatTimeAgo = (date: string | Date): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(dateObj, { addSuffix: true });
};

// Fighter record formatter
export const formatRecord = (wins: number, losses: number, draws = 0): string => {
  return draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
};

// Odds formatters
export const formatOdds = (odds: number): string => {
  if (odds > 0) {
    return `+${odds}`;
  }
  return odds.toString();
};

export const formatImpliedProbability = (odds: number): string => {
  let probability: number;
  
  if (odds > 0) {
    probability = 100 / (odds + 100);
  } else {
    probability = Math.abs(odds) / (Math.abs(odds) + 100);
  }
  
  return formatPercentage(probability * 100, 1);
};

// Weight class formatter
export const formatWeightClass = (weightClass: string): string => {
  return weightClass
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Fight method formatter
export const formatFightMethod = (method: string): string => {
  const methodMap: Record<string, string> = {
    'KO_TKO': 'KO/TKO',
    'SUBMISSION': 'Submission',
    'DECISION_UNANIMOUS': 'Unanimous Decision',
    'DECISION_MAJORITY': 'Majority Decision',
    'DECISION_SPLIT': 'Split Decision',
    'DQ': 'Disqualification',
    'NC': 'No Contest',
  };
  
  return methodMap[method] || method;
};

// Stance formatter
export const formatStance = (stance: string): string => {
  const stanceMap: Record<string, string> = {
    'ORTHODOX': 'Orthodox',
    'SOUTHPAW': 'Southpaw',
    'SWITCH': 'Switch',
  };
  
  return stanceMap[stance] || stance;
};