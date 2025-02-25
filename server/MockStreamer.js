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
    
    // Check if the command is SAMPLE_DIST (using the command prefix)
    if (data.startsWith('%R8Q,1:')) {
      setTimeout(() => {
        // Generate random numbers for x, y, z (under 10) with 4 decimal places.
        const x = (Math.random() * 10).toFixed(4);
        const y = (Math.random() * 10).toFixed(4);
        const z = (Math.random() * 10).toFixed(4);

        // Format the current date as dd.MM.yyyy.
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
        const pointString = `TS0007,${x},${y},${z},${dateStr},${timeStr},${idNum}`;
        logger.info(`MockStreamer emitting point event: ${pointString}`);
        this.emit('point', pointString);
      }, this.simulatedDelay);
    } else {
      // For all other commands, emit a streaming-response event with a success code (":0").
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
