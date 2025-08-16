import React, { useState } from 'react';
import {
  IconButton,
  Badge,
  Menu,
  MenuItem,
  Typography,
  Box,
  Divider,
  Button,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useAppContext, appActions } from '../../context/AppContext';
import { formatDistanceToNow } from 'date-fns';

export function NotificationCenter() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const { state, dispatch } = useAppContext();
  const open = Boolean(anchorEl);

  const unreadCount = state.notifications.filter(n => !n.read).length;

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleMarkAsRead = (id: string) => {
    dispatch(appActions.markNotificationRead(id));
  };

  const handleRemoveNotification = (id: string) => {
    dispatch(appActions.removeNotification(id));
  };

  const handleClearAll = () => {
    state.notifications.forEach(notification => {
      dispatch(appActions.removeNotification(notification.id));
    });
    handleClose();
  };

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleClick}
        aria-label="notifications"
      >
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: {
            width: 360,
            maxHeight: 400,
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Notifications</Typography>
          {state.notifications.length > 0 && (
            <Button size="small" onClick={handleClearAll}>
              Clear All
            </Button>
          )}
        </Box>
        
        <Divider />

        {state.notifications.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              No notifications
            </Typography>
          </MenuItem>
        ) : (
          state.notifications.map((notification) => (
            <MenuItem
              key={notification.id}
              sx={{
                flexDirection: 'column',
                alignItems: 'flex-start',
                whiteSpace: 'normal',
                backgroundColor: notification.read ? 'transparent' : 'action.hover',
                '&:hover': {
                  backgroundColor: 'action.selected',
                },
              }}
              onClick={() => !notification.read && handleMarkAsRead(notification.id)}
            >
              <Box sx={{ display: 'flex', width: '100%', justifyContent: 'space-between' }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: notification.read ? 'normal' : 'bold',
                    flex: 1,
                  }}
                >
                  {notification.message}
                </Typography>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveNotification(notification.id);
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
              </Typography>
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  );
}