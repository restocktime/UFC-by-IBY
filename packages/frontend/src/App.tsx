
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from 'react-query';
import { AppProvider } from './context/AppContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Layout } from './components/layout/Layout';
import theme from './theme';

// Import pages
import { HomePage } from './pages/HomePage';
import { FightersPage } from './pages/FightersPage';
import { PredictionsPage } from './pages/PredictionsPage';
import { OddsPage } from './pages/OddsPage';
import { SettingsPage } from './pages/SettingsPage';

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <AppProvider>
            <Router>
              <Layout>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/fighters" element={<FightersPage />} />
                  <Route path="/fighters/:id" element={<FightersPage />} />
                  <Route path="/predictions" element={<PredictionsPage />} />
                  <Route path="/odds" element={<OddsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Routes>
              </Layout>
            </Router>
          </AppProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;