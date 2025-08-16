import { Box, Tabs, Tab } from '@mui/material';
import { useState } from 'react';
import { AlertSettings } from '../components/odds/AlertSettings';

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
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export function SettingsPage() {
  const [tabValue, setTabValue] = useState(0);
  
  // In a real app, this would come from authentication context
  const userId = 'current-user-id';

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="Notifications" />
          <Tab label="Account" />
          <Tab label="Privacy" />
        </Tabs>
      </Box>
      
      <TabPanel value={tabValue} index={0}>
        <AlertSettings userId={userId} />
      </TabPanel>
      
      <TabPanel value={tabValue} index={1}>
        <Box>Account settings coming soon...</Box>
      </TabPanel>
      
      <TabPanel value={tabValue} index={2}>
        <Box>Privacy settings coming soon...</Box>
      </TabPanel>
    </Box>
  );
}