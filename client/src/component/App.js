// client/src/component/App.js
import React, { useState, useEffect, useRef } from 'react'
import DropDownListSession from './DropDownListSession.js'
import ButtonStart from './Button.js'
import Output from './Output.js'
import { Box, Typography, CircularProgress } from '@mui/material'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import socket from '../socket'
import { API_BASE_URL } from '../config'
import logger from '../helpers/loggers.js' 

const App = () => {
  const [buttonStatus, setButtonStatus] = useState(false)
  const [sessionIDValue, setSessionIDValue] = useState("AAM-ShopLink")
  const [stationIDValue, setStationIDValue] = useState('')
  const [stationName, setStationName] = useState('')
  const [data, setData] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState('Start connection')
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState([])

  const logsContainerRef = useRef(null)

  useEffect(() => {
    if (buttonStatus) {
      setLoading(true)
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          title: 'start telnet streamer',
          sessionID: sessionIDValue,
          stationMac: stationIDValue,
          stationNames: stationName,
        }),
      }

      fetch(`${API_BASE_URL}/api/button`, requestOptions)
        .then((res) => res.json())
        .then((respData) => {
          setData(respData.message)
          setLoading(false)
          logger.info(respData.message)
          logger.info('Streamer started successfully.')
        })
        .catch((error) => {
          console.error('Error:', error)
          logger.error('Connection failed.')
          setData('Connection failed.')
          setLoading(false)
        })

      setButtonStatus(false)
    }

    // WebSocket event listeners
    socket.on('stream-data', (streamData) => {
      setData(streamData)
      logger.info('Received stream data from server.', streamData)
    })

    socket.on('log', (log) => {
      setLogs((prevLogs) => [...prevLogs, log])
      switch (log.level) {
        case 'info':
          logger.info(log.message)
          break
        case 'warn':
          logger.warn(log.message)
          break
        case 'error':
          logger.error(log.message)
          break
        default:
          logger.info(log.message)
      }
    })

    socket.on('connect', () => {
      setConnectionStatus('Connected')
      logger.info('WebSocket connected.')
    })

    socket.on('disconnect', () => {
      setConnectionStatus('Disconnected')
      logger.warn('WebSocket disconnected.')
    })

    socket.on('connect_error', (error) => {
      setConnectionStatus('Connection Error')
      logger.error(`WebSocket connection error: ${error.message}`)
      console.error('WebSocket connection error:', error)
    })

    socket.on('reconnect_attempt', () => {
      setConnectionStatus('Trying to reconnect')
      logger.warn('WebSocket attempting to reconnect.')
    })

    socket.on('reconnect_error', (error) => {
      setConnectionStatus('Reconnection Error')
      logger.error(`WebSocket reconnection error: ${error.message}`)
      console.error('WebSocket reconnection error:', error)
    })

    socket.on('reconnect_failed', () => {
      setConnectionStatus('Failed to reconnect')
      logger.error('WebSocket failed to reconnect.')
    })

    socket.on('reconnect', () => {
      setConnectionStatus('Connected')
      logger.info('WebSocket reconnected.')
    })

    return () => {
      socket.off('stream-data')
      socket.off('log')
      socket.off('connect')
      socket.off('disconnect')
      socket.off('connect_error')
      socket.off('reconnect_attempt')
      socket.off('reconnect_error')
      socket.off('reconnect')
    }
  }, [buttonStatus, sessionIDValue, stationIDValue, stationName])

  // UseEffect to scroll to top whenever logs change
  useEffect(() => {
    if (logsContainerRef.current) {
      // Since we are using column-reverse, the newest log is visually at the top
      // Setting scrollTop = 0 ensures we always see the top (newest log)
      logsContainerRef.current.scrollTop = 0
    }
  }, [logs])

  return (
    <ThemeProvider theme={createTheme()}>
      <Box sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          Telnetserver Control Panel
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 4 }}>
          <DropDownListSession
            setSessionIDValue={setSessionIDValue}
            setStationIDValue={setStationIDValue}
            setStationName={setStationName}
          />
          <ButtonStart setButtonStatus={setButtonStatus} />
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1">
            Connection Status:{' '}
            <span style={{ color: getStatusColor(connectionStatus) }}>
              {connectionStatus}
            </span>
            {loading && <CircularProgress size={20} sx={{ ml: 2 }} />}
          </Typography>
        </Box>

        <Output data={data} />

        {/* Display Logs */}
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>
            Application Logs
          </Typography>
          <Box
            ref={logsContainerRef}
            sx={{
              maxHeight: '300px',
              overflowY: 'scroll',
              border: '1px solid #ccc',
              p: 2,
              display: 'flex',
              // flexDirection: 'column-reverse'
              flexDirection: 'column'
            }}
          >
            {logs.length > 0 ? (
              logs.map((log, index) => (
                <Typography key={index} variant="body2">
                  <strong>[{log.timestamp}]</strong>{' '}
                  <span style={{ color: getLogColor(log.level) }}>
                    {log.level.toUpperCase()}
                  </span>
                  : {log.message}
                </Typography>
              ))
            ) : (
              <Typography variant="body2">No logs to display.</Typography>
            )}
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  )
}

const getStatusColor = (status) => {
  switch (status) {
    case 'Start connection':
      return 'yellow'
    case 'Connected':
      return 'green'
    case 'Connecting':
      return 'blue'
    case 'Connection Error':
    case 'Reconnection Error':
    case 'Failed to reconnect':
      return 'red'
    case 'Trying to reconnect':
      return 'orange'
    default:
      return 'black'
  }
}

const getLogColor = (level) => {
  switch (level) {
    case 'info':
      return 'green'
    case 'warn':
      return 'orange'
    case 'error':
      return 'red'
    default:
      return 'black'
  }
}

export default App
