// server/mockStreamer.js
import { BaseStreamer } from './BaseStreamer.js';
import { logger } from './helpers/logger.js';

class MockStreamer extends BaseStreamer {
  constructor(params = {}) {
    super();
    this.params = params;
    this.connected = false;
    this.simulatedDelay = 200; // delay in milliseconds
    // Dummy socket to satisfy any .once calls in the bridge.
    this.socket = { once: () => {} };
    // Store the last coordinates received from the turnTelescope command.
    this.lastCoords = null;
  }

  // Function to apply a slight variation while preserving the first 4 decimals.
  slightVariation(value) {
    const fixed = parseFloat(value.toFixed(4));
    // Variation in the range [-0.0001, 0.0001]
    const variation = (Math.random() * 0.0002) - 0.0001;
    return fixed + variation;
  }

  async connect() {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.connected = true;
        logger.info('MockStreamer connected.');
        this.emit('connect');
        resolve();
      }, 100);
    });
  }

  send(data) {
    if (!this.connected) {
      logger.warn('MockStreamer not connected. Cannot send data.');
      return;
    }
    logger.info(`MockStreamer received command: ${data.trim()}`);

    // Handle turnTelescope command: e.g. "%R8Q,7:1,${x},${y},${z}\r\n"
    if (data.startsWith('%R8Q,7:')) {
      let commandWithoutPrefix = data.substring('%R8Q,7:'.length).trim();
      // Expected format: "1,${x},${y},${z}" – split by comma.
      const parts = commandWithoutPrefix.split(',');
      if (parts.length >= 4) {
        this.lastCoords = {
          x: parseFloat(parts[1]),
          y: parseFloat(parts[2]),
          z: parseFloat(parts[3])
        };
        logger.info(`MockStreamer stored lastCoords: ${JSON.stringify(this.lastCoords)}`);
      }
      // For turnTelescope, simply respond with a streaming-response.
      setTimeout(() => {
        const response = `${data.trim()}:0`;
        logger.info(`MockStreamer emitting streaming-response: ${response}`);
        this.emit('streaming-response', response);
      }, this.simulatedDelay);

    // Handle SAMPLE_DIST command: "%R8Q,1:" 
    } else if (data.startsWith('%R8Q,1:')) {
      setTimeout(() => {
        let x, y, z;
        if (this.lastCoords) {
          // Use the stored coordinates with a slight variation.
          x = this.slightVariation(this.lastCoords.x);
          y = this.slightVariation(this.lastCoords.y);
          z = this.slightVariation(this.lastCoords.z);
        } else {
          // Fallback to random values.
          x = parseFloat((Math.random() * 10).toFixed(3));
          y = parseFloat((Math.random() * 10).toFixed(3));
          z = parseFloat((Math.random() * 10).toFixed(3));
        }
  
        // Format current date as dd.MM.yyyy.
        const now = new Date();
        const pad = (num, size = 2) => String(num).padStart(size, '0');
        const day = pad(now.getDate());
        const month = pad(now.getMonth() + 1);
        const year = now.getFullYear();
        const dateStr = `${day}.${month}.${year}`;
  
        // Format time as HH:mm:ss.mmm.
        const hours = pad(now.getHours());
        const minutes = pad(now.getMinutes());
        const seconds = pad(now.getSeconds());
        const millis = pad(now.getMilliseconds(), 3);
        const timeStr = `${hours}:${minutes}:${seconds}.${millis}`;
  
        // Generate a random numeric ID.
        const idNum = Math.floor(Math.random() * 10000000);
  
        // Build the measurement string.
        const pointString = `TS0007,${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)},${dateStr},${timeStr},${idNum}`;
        logger.info(`MockStreamer emitting point event: ${pointString}`);
        this.emit('point', pointString);
      }, this.simulatedDelay);
  
    } else {
      // For all other commands, emit a streaming-response with success code.
      setTimeout(() => {
        const response = `${data.trim()}:0`;
        logger.info(`MockStreamer emitting streaming-response: ${response}`);
        this.emit('streaming-response', response);
      }, this.simulatedDelay);
    }
  }

  reconnect() {
    logger.info('MockStreamer reconnecting...');
    this.connected = false;
    this.connect();
  }
}

export { MockStreamer };
