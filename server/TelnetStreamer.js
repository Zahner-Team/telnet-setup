// server/helpers/telnetStreamer.js
import net from 'net';
import { zeaDebug } from './helpers/zeaDebug.js';
import { BaseStreamer } from './BaseStreamer.js';
import find from 'local-devices';
import printStart from './helpers/hello.js';
import { logger } from './helpers/logger.js'; // Import the initialized logger

const SURVEY_STREAMING_RESPONSE_PREFIX = '%R8P';

/**
 * Attempts to find the IP addresses of devices based on their MAC addresses.
 * Retries up to `maxAttempts` times if no devices are found.
 * @param {Array<string>} stationMacs - Array of station MAC addresses.
 * @returns {Array<Object>} - Array of matched device objects.
 */
async function getIp(stationMacs) {
  let attempts = 0;
  const maxAttempts = 5;
  let found = [];
  let notFound = true;

  while (notFound && attempts < maxAttempts) {
    const devices = await find();
    console.log('Devices found:', devices); // Optional
    // logger.info(`Devices found: ${JSON.stringify(devices)}`); // Log the devices found
    const matchedDevices = devices.filter(device => stationMacs.includes(device.mac));
    if (matchedDevices.length > 0) {
      found = matchedDevices;
      notFound = false;
    } else {
      console.log(`Attempt ${attempts + 1}: No matching devices found. Retrying...`); // Optional
      logger.warn(`Attempt ${attempts + 1}: No matching devices found. Retrying...`);
      attempts++;
      await new Promise(res => setTimeout(res, 2000)); // Wait 2 seconds before retrying
    }
  }

  return found;
}

class TelnetStreamer extends BaseStreamer {
  constructor(params) {
    super();
    this.params = params;
    this.socket = null;
    this.counter = 0;
    this.close = false;
    this.GLOBAL_TIMEOUT = 10000; // 10 seconds
  }

  /**
   * Establishes a connection to the Telnet server.
   */
  async connect() {
    const socket = new net.Socket();
    this.socket = socket;
    const foundStations = await getIp(this.params.stationMacs);

    if (foundStations.length === 0) {
      console.log('No IP found for the provided MAC addresses. Restart the server and try again.'); // Optional
      logger.warn('No IP found for the provided MAC addresses. Restart the server and try again.');
      this.emit('error', new Error('No IP found for the provided MAC addresses.'));
      return;
    }

    // Assuming one station per streamer. Modify if multiple are supported.
    const station = foundStations[0];
    const ipToConnect = station.ip;

    console.log('Connecting to IP:', ipToConnect); // Optional
    logger.info(`Connecting to IP: ${ipToConnect}`);

    this.params.host = ipToConnect;

    printStart();
    console.log('\n------------------ Session Streaming ------------------'); // Optional
    logger.info('\n------------------ Session Streaming ------------------');

    // Handle socket errors
    socket.on('error', (err) => {
      console.error('Socket error:', err.message); // Optional
      logger.error(`Socket error: ${err.message}`);

      if ((err.code === 'ECONNRESET' || err.code === 'EPIPE') && this.counter < 5) {
        console.log(`Socket error -- ${err.code}, waiting 2 seconds to reconnect...`); // Optional
        logger.warn(`Socket error -- ${err.code}, waiting 2 seconds to reconnect...`);
        this.counter++;
        setTimeout(() => {
          this.emit('reset');
        }, 2000);
      } else if (this.counter >= 5 && !this.close) {
        console.log(`Socket error -- ${err.code}, max retries reached. Attempting to reconnect...`); // Optional
        logger.warn(`Socket error -- ${err.code}, max retries reached. Attempting to reconnect...`);
        this.counter++;
        this.close = true;
        setTimeout(() => {
          this.emit('reset');
        }, 5000);
      }
    });

    // Handle incoming data
    socket.on('data', this.#handleData.bind(this));

    // Handle socket closure
    socket.on('close', () => {
      console.log('Socket closed.'); // Optional
      logger.warn('Socket closed.');
      this.emit('end');
    });

    // Establish connection
    socket.connect(this.params.port, this.params.host, () => {
      console.log('Connected to Telnet server.'); // Optional
      logger.info('Connected to Telnet server.');
      socket.write('%1POWR 1 ');
    });
  }

  /**
   * Sends data through the Telnet socket.
   * @param {string} data - The data to send.
   */
  send(data) {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(data);
      zeaDebug('Sent:', data);
      logger.info(`Sent data: ${data}`);
    } else {
      console.error('Cannot send data, socket is not connected.'); // Optional
      logger.warn('Cannot send data, socket is not connected.');
      this.emit('error', new Error('Socket not connected.'));
    }
  }

  /**
   * Handles incoming data from the Telnet socket.
   * @param {Buffer} data - The incoming data buffer.
   */
  #handleData(data) {
    const decoded = data.toString('utf8').trim();
    zeaDebug('Received:', decoded);
    logger.info(`Received data: ${decoded}`);

    const isStreamingResponse = decoded.startsWith(SURVEY_STREAMING_RESPONSE_PREFIX);
    const eventType = isStreamingResponse ? 'streaming-response' : 'point';
    this.emit(eventType, decoded);
  }

  /**
   * Reconnects to the Telnet server.
   */
  async reconnect() {
    console.log('Reconnecting to Telnet server...'); // Optional
    logger.info('Reconnecting to Telnet server...');
    if (this.socket) {
      this.socket.destroy();
    }
    await this.connect();
  }
}

export { TelnetStreamer };
