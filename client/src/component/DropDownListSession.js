// client/src/components/DropDownListSession.js
import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import { ClientSession } from '../models/ClientSession.js';

const DropDownListSession = ({ setSessionIDValue, setStationIDValue, setStationName }) => {
  // const [sessionID, setSessionID] = useState('');
  const [station, setStation] = useState('');
  const [connectionType, setConnectionType] = useState(0); // 0: WiFi, 1: USB
  const [documents, setDocuments] = useState([]);

  // Define MAC addresses based on connection type
  const LuigiMac = connectionType === 0 ? '00:17:17:06:8a:a5' : '02:24:00:00:00:00';
  const MarioMac = connectionType === 0 ? '08:00:28:12:03:58' : '02:24:00:00:00:00';
  const PrincessPeachMac = connectionType === 0 ? '00:17:17:07:84:ed' : '02:24:00:00:00:00';

  const lookupValue = {
    '00:17:17:06:8a:a5': 'Luigi',
    '08:00:28:12:03:58': 'Mario',
    '00:17:17:07:84:ed': 'Princess Peach',
    '02:24:00:00:00:00': 'Princess Peach'
  };

  // removed for updating to shapediver
  // const handleChangeSession = (event) => {
  //   const selectedSession = event.target.value;
  //   console.log('Selected Session:', selectedSession);
  //   setSessionID(event.target.value);
  //   setSessionIDValue(event.target.value);
  // };
  // setSessionIDValue("AAM-ShopLink"); //moved to below

  const handleChangeStation = (event) => {
    const selectedStation = event.target.value;
    console.log('Selected Station:', lookupValue[selectedStation], event.target);
    setStation(selectedStation);
    setStationIDValue(selectedStation);
    setStationName(lookupValue[selectedStation]);
    setSessionIDValue("AAM-ShopLink"); // added to not rerender error
  };

  const handleChangeConnectionType = (event) => {
    const selectedType = event.target.value;
    console.log('Selected Connection Type:', selectedType === 0 ? 'WiFi' : 'USB');
    setConnectionType(selectedType);
    setStation(''); // Reset station selection when connection type changes
    setStationIDValue('');
    setStationName('');
  };

  // Fetch sessions from Firebase or other data source
  const fetchSessions = async () => {
    const getSession = new ClientSession();
    try {
      const sessionAwaited = await getSession.init();
      console.log("Fetched Sessions:", sessionAwaited);
      return sessionAwaited;
    } catch (error) {
      console.error("Error fetching sessions:", error);
      return [];
    }
  };

  useEffect(() => {
    fetchSessions().then(result => {
      if (result) {
        setDocuments(result);
      }
    });
  }, []);

  const sessionItems = documents.map((doc) => (
    <MenuItem key={doc.id} value={doc.id}>
      {doc.name}
    </MenuItem>
  ));

  return (
    <Box sx={{ minWidth: 300 }}>
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel id="select-connection-label">Connection Type</InputLabel>
        <Select
          labelId="select-connection-label"
          id="select-connection"
          value={connectionType}
          label="Connection Type"
          onChange={handleChangeConnectionType}
        >
          <MenuItem value={0}>WiFi</MenuItem>
          <MenuItem value={1}>USB</MenuItem>
        </Select>
      </FormControl>

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel id="select-station-label">Multistation</InputLabel>
        <Select
          labelId="select-station-label"
          id="select-station"
          value={station}
          label="Multistation"
          onChange={handleChangeStation}
          disabled={!connectionType && station === '02:24:00:00:00:00'} // Disable invalid selections
        >
          <MenuItem value={LuigiMac}>Luigi</MenuItem>
          <MenuItem value={MarioMac}>Mario</MenuItem>
          <MenuItem value={PrincessPeachMac}>Princess Peach</MenuItem>
        </Select>
      </FormControl>

      {/* <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel id="select-session-label">Session ID</InputLabel>
        <Select
          labelId="select-session-label"
          id="select-session"
          value={sessionID}
          label="Session ID"
          onChange={handleChangeSession}
        >
          {sessionItems}
        </Select>
      </FormControl> */}
    </Box>
  );
};

export default DropDownListSession;
