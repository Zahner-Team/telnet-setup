// server/models/Command.js
import { db } from '../helpers/firebase.js';
import { collection, doc, setDoc } from 'firebase/firestore';

// Export the commands and responses
export const TotalStationCommands = {
  START_STREAM: '%R8Q,4:\r\n',
  STOP_STREAM: '%R8Q,5:\r\n',
  turnTelescope: (x, y, z) => `%R8Q,7:1,${x},${y},${z}\r\n`,
  SAMPLE_DIST: '%R8Q,1:\r\n',
  SEARCH: '%R8Q,6:1\r\n',
};

export const TotalStationResponses = {
  0: 'GRC_OK',
  41: 'GRC_POSITIONING_FAILED',
  26: 'GRC_DIST_ERR',
  28: 'Issue with reflector',
  31: 'GRC_REFLECTOR_NOT_FOUND',
  50: 'GRC_START_FAILED',
  51: 'GRC_STREAM_ACTIVE',
  53: 'GRC_STREAM_NOT_ACTIVE',
  3107: 'Another request still pending.',
};

class Command {
  constructor(streamer, session, data) {
    this.streamer = streamer;
    this.session = session;
    this.data = data;
    this.globalTimeout = 30000; // 30 seconds
    this.timeoutHandle = null;
    this.maxRetries = 2; // Attempt up to 2 times if reflector not found
    this.attempts = 0;
  }

  async invoke() {
    this.streamer.removeAllListeners('streaming-response');
    this.streamer.removeAllListeners('point');
    this.streamer.removeAllListeners('end');

    console.log('------------------ \n');
    console.log('Command invoked for anchor:', this.data.anchor);

    const { x, y, z } = this.data.position;
    console.log('Position:', x, y, z);

    return this.#executeSequence(y, x, z);
  }

  async #executeSequence(x, y, z) {
    this.attempts++;
    console.log(`Attempt ${this.attempts}/${this.maxRetries} for anchor: ${this.data.anchor}`);

    const localQueue = [
      TotalStationCommands.STOP_STREAM,
      TotalStationCommands.START_STREAM,
      TotalStationCommands.turnTelescope(x, y, z),
      // TotalStationCommands.SEARCH,
      TotalStationCommands.SAMPLE_DIST,
    ];

    return new Promise((resolve, reject) => {
      let currentCommand = null;

      const sendNextCommand = (cmd) => {
        currentCommand = cmd;
        console.log('Sending next command:', cmd.trim());
        this.streamer.send(cmd);
        this.resetTimeout(() => {
          console.error('Command timed out.');
          this.streamer.emit('end');
          reject(new Error('Command timed out.'));
        });
      };

      const handleReflectorNotFound = () => {
        if (this.attempts < this.maxRetries) {
          console.log(`Reflector not found. Retrying in 5 seconds... (Attempt ${this.attempts})`);
          this.#cleanupListeners(onStreamingResponse, onPoint, onEnd);
          setTimeout(() => {
            this.#executeSequence(x, y, z).then(resolve).catch(reject);
          }, 5000);
        } else {
          console.log(`Reflector not found after ${this.attempts} attempts. Stopping.`);
          this.streamer.emit('end');
          reject(new Error('GRC_REFLECTOR_NOT_FOUND'));
        }
      };

      const onStreamingResponse = async (response) => {
        this.clearTimeoutHandle();
        const responseCode = parseInt(response.substring(response.lastIndexOf(':') + 1), 10);

        if (responseCode !== 0) {
          console.log('Response error:', TotalStationResponses[responseCode] || 'Unknown Error');

          if (responseCode === 31) {
            return handleReflectorNotFound();
          }

          if ([28, 41, 26, 50].includes(responseCode)) {
            this.streamer.emit('end');
            return reject(new Error(TotalStationResponses[responseCode] || 'Unknown Error'));
          }

          if (responseCode === 3107) {
            console.log('Previous command still running (Code 3107), waiting 0.5 seconds');
            this.clearTimeoutHandle();
            setTimeout(() => {
              sendNextCommand(currentCommand);
            }, 500);
            return;
          }
        }

        const nextCommand = localQueue.shift();
        if (!nextCommand) {
          return;
        }
        sendNextCommand(nextCommand);
      };

      const onEnd = async () => {
        this.clearTimeoutHandle();
        this.#cleanupListeners(onStreamingResponse, onPoint, onEnd);
        await this.#markAsInvoked();
        resolve();
      };

      const onPoint = async (point) => {
        clearTimeout(this.timeoutHandle);
        this.#cleanupListeners(onStreamingResponse, onPoint, onEnd);

        if (point === 'connection closed: too many clients') {
          console.log('Reset: connection closed due to too many clients.');
          setTimeout(() => {
            this.streamer.emit('reset');
            reject(new Error('Connection closed: too many clients'));
          }, 5000);
          return;
        }

        await this.#markAsInvoked();
        console.log(`ANCHOR: ${this.data.anchor}\nPOINT: ${point}`);
        await this.session.addPoint(point, this.data.anchor); 
        console.log('----Command Complete----');
        resolve();
      };

      this.streamer.on('streaming-response', onStreamingResponse);
      this.streamer.on('end', onEnd);
      this.streamer.on('point', onPoint);

      const firstCommand = localQueue.shift();
      if (!firstCommand) {
        return reject(new Error('No commands to execute.'));
      }
      sendNextCommand(firstCommand);
    });
  }

  resetTimeout(callback) {
    this.clearTimeoutHandle();
    this.timeoutHandle = setTimeout(callback, this.globalTimeout);
  }

  clearTimeoutHandle() {
    if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
    this.timeoutHandle = null;
  }

  #cleanupListeners(onStreamingResponse, onPoint, onEnd) {
    this.streamer.removeListener('streaming-response', onStreamingResponse);
    this.streamer.removeListener('point', onPoint);
    this.streamer.removeListener('end', onEnd);
  }

  async #markAsInvoked() {
    try {
      const docRef = doc(collection(db, 'commands'), this.data.id);
      await setDoc(docRef, { isInvoked: true }, { merge: true });
      console.log(`Command marked as invoked for anchor: ${this.data.anchor}`);
    } catch (error) {
      console.error('Error marking command as invoked:', error);
    }
  }
}

export { Command };
