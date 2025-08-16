import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { AppProvider, useAppContext, appActions } from '../AppContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppProvider>{children}</AppProvider>
);

describe('AppContext', () => {
  it('provides initial state', () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });

    expect(result.current.state.user).toBeNull();
    expect(result.current.state.isAuthenticated).toBe(false);
    expect(result.current.state.loading).toBe(false);
    expect(result.current.state.error).toBeNull();
    expect(result.current.state.notifications).toEqual([]);
  });

  it('handles loading state', () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });

    act(() => {
      result.current.dispatch(appActions.setLoading(true));
    });

    expect(result.current.state.loading).toBe(true);
  });

  it('handles error state', () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });

    act(() => {
      result.current.dispatch(appActions.setError('Test error'));
    });

    expect(result.current.state.error).toBe('Test error');
    expect(result.current.state.loading).toBe(false);
  });

  it('handles user authentication', () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });

    const testUser = {
      id: '1',
      email: 'test@example.com',
      preferences: {
        followedFighters: [],
        weightClasses: [],
        alertTypes: [],
        theme: 'dark' as const,
      },
    };

    act(() => {
      result.current.dispatch(appActions.setUser(testUser));
    });

    expect(result.current.state.user).toEqual(testUser);
    expect(result.current.state.isAuthenticated).toBe(true);
    expect(result.current.state.loading).toBe(false);
  });

  it('handles notifications', () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });

    act(() => {
      result.current.dispatch(
        appActions.addNotification({
          type: 'info',
          message: 'Test notification',
        })
      );
    });

    expect(result.current.state.notifications).toHaveLength(1);
    expect(result.current.state.notifications[0].message).toBe('Test notification');
    expect(result.current.state.notifications[0].read).toBe(false);

    const notificationId = result.current.state.notifications[0].id;

    act(() => {
      result.current.dispatch(appActions.markNotificationRead(notificationId));
    });

    expect(result.current.state.notifications[0].read).toBe(true);

    act(() => {
      result.current.dispatch(appActions.removeNotification(notificationId));
    });

    expect(result.current.state.notifications).toHaveLength(0);
  });
});