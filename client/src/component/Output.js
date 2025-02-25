// client/src/components/Output.js
import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

const Output = ({ data }) => {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Output:
      </Typography>
      <Paper elevation={3} sx={{ p: 2, minHeight: '50px', maxHeight: '400px', overflowY: 'auto' }}>
        <Typography variant="body1">
          {data ? data : 'No data received yet.'}
        </Typography>
      </Paper>
    </Box>
  );
};

export default Output;
