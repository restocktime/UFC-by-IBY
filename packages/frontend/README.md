# UFC Prediction Platform - Frontend

A modern React TypeScript application for the UFC Prediction Platform, providing a responsive dashboard for fight analytics, predictions, and odds tracking.

## Features

- **Modern React Architecture**: Built with React 18, TypeScript, and Vite
- **Material-UI Design System**: Consistent UFC-themed UI components
- **Responsive Design**: Mobile-first approach with breakpoint-aware layouts
- **State Management**: Context API with reducer pattern for global state
- **Real-time Updates**: React Query for efficient data fetching and caching
- **Comprehensive Testing**: Unit tests with React Testing Library and Vitest
- **Type Safety**: Full TypeScript coverage with strict type checking

## Tech Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Library**: Material-UI (MUI) v5
- **Routing**: React Router v6
- **State Management**: React Context + useReducer
- **Data Fetching**: React Query + Axios
- **Charts**: Recharts + MUI X Charts
- **Testing**: Vitest + React Testing Library
- **Styling**: Emotion (CSS-in-JS)

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── common/         # Generic components (LoadingSpinner, StatCard, etc.)
│   └── layout/         # Layout components (Navigation, Layout, etc.)
├── context/            # React Context providers and hooks
├── hooks/              # Custom React hooks
├── pages/              # Page components
├── services/           # API services and external integrations
├── theme/              # Material-UI theme configuration
├── test/               # Test utilities and setup
└── utils/              # Utility functions and formatters
```

## Key Components

### Layout System
- **Layout**: Main application layout with navigation and header
- **Navigation**: Responsive sidebar navigation with mobile drawer
- **NotificationCenter**: Real-time notification management

### Common Components
- **StatCard**: Reusable card for displaying statistics with trends
- **LoadingSpinner**: Consistent loading states
- **ErrorBoundary**: Error handling and recovery

### State Management
- **AppContext**: Global application state with user preferences and notifications
- **Actions**: Type-safe action creators for state updates

## Development

### Available Scripts

```bash
# Development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Clean build artifacts
npm run clean
```

### Testing

The application includes comprehensive unit tests for:
- Component rendering and interactions
- State management logic
- Utility functions
- Error boundaries

Tests are written using Vitest and React Testing Library with custom test utilities for consistent provider setup.

### Theme System

The application uses a custom Material-UI theme with:
- UFC-inspired color palette (red primary, gold secondary)
- Dark mode optimized design
- Responsive breakpoints
- Custom component overrides
- Typography scale

### Responsive Design

The application is fully responsive with:
- Mobile-first approach
- Breakpoint-aware components
- Adaptive navigation (drawer on mobile, sidebar on desktop)
- Flexible grid layouts
- Touch-friendly interactions

## API Integration

The frontend communicates with the backend API through:
- Axios HTTP client with interceptors
- React Query for caching and synchronization
- Type-safe API service layer
- Automatic error handling and retry logic

## Future Enhancements

The current implementation provides the foundation for:
- Fighter profile and comparison components (Task 10.2)
- Fight prediction dashboard (Task 10.3)
- Odds tracking and alerts interface (Task 10.4)
- Real-time WebSocket connections
- Progressive Web App features
- Advanced data visualizations