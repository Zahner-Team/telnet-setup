// server/models/MultiPointCommand.js
import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../helpers/firebase.js';
import { TotalStationCommands, TotalStationResponses } from './Command.js';
import { logger } from '../helpers/logger.js';

export class MultiPointCommand {
  constructor(streamer, data) {
    this.streamer = streamer;
    this.data = data;
    // Convert ToMeasure into an array of [pointName, coords] pairs.
    this.pointsToMeasure = Object.entries(data.ToMeasure || {});
    logger.info(
      `MultiPointCommand created for doc ${data.id} with ${this.pointsToMeasure.length} point(s).`
    );
    this.measuredResults = {}; // Will hold parsed measurement data for each point.
    this.globalTimeout = 30000; // 30-second timeout per command step.
  }

  async invoke() {
    logger.info(`Invoking MultiPointCommand for doc: ${this.data.id}`);
    // Remove any pre-existing listeners.
    this.streamer.removeAllListeners('streaming-response');
    this.streamer.removeAllListeners('point');
    this.streamer.removeAllListeners('end');

    try {
      // Process each measurement point sequentially.
      for (const [pointName, coords] of this.pointsToMeasure) {
        logger.info(
          `Measuring point: ${pointName} with coords: (${coords.x}, ${coords.y}, ${coords.z})`
        );
        await this.#measurePoint(pointName, coords);
      }
      // Once all measurements are complete, write the aggregated results.
      await this.#writeMeasuredData();
      // Mark the command document as invoked.
      await this.#markAsInvoked();
      logger.info(`MultiPointCommand completed for doc: ${this.data.id}`);
    } catch (error) {
      logger.error(`MultiPointCommand error: ${error.message}`);
      // On error, mark as invoked to avoid re‑processing.
      await this.#markAsInvoked();
    } finally {
      // Cleanup event listeners.
      this.streamer.removeAllListeners('streaming-response');
      this.streamer.removeAllListeners('point');
      this.streamer.removeAllListeners('end');
    }
  }

  // Processes a single measurement point.
  #measurePoint(pointName, coords) {
    return new Promise((resolve, reject) => {
      const localQueue = [
        TotalStationCommands.STOP_STREAM,
        TotalStationCommands.START_STREAM,
        TotalStationCommands.turnTelescope(coords.x, coords.y, coords.z),
        // TotalStationCommands.SEARCH,
        TotalStationCommands.SAMPLE_DIST,
      ];
      let currentCommand = null;
      let timeoutHandle = null;

      // Local timeout helpers.
      const resetTimeout = (callback) => {
        clearTimeout(timeoutHandle);
        timeoutHandle = setTimeout(callback, this.globalTimeout);
      };
      const clearTimeoutHandle = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        timeoutHandle = null;
      };

      const onResponse = (response) => {
        clearTimeoutHandle();
        // Extract numeric response code.
        const codeStr = response.substring(response.lastIndexOf(':') + 1).trim();
        const code = parseInt(codeStr, 10);
        if (code !== 0) {
          logger.warn(
            `Response error for point ${pointName}: code ${code} => ${
              TotalStationResponses[code] || 'Unknown error'
            }`
          );
          // Reject immediately for critical errors.
          if ([28, 31, 41, 26, 50].includes(code)) {
            cleanupAndReject(new Error(TotalStationResponses[code] || 'Measurement error'));
            return;
          }
          // If a previous command is still running, retry the current command.
          if (code === 3107) {
            logger.info(`Code 3107 received for point ${pointName}; retrying current command.`);
            resetTimeout(() => {
              cleanupAndReject(new Error('Timed out after retrying command.'));
            });
            sendNextCommand(currentCommand);
            return;
          }
        }
        // Send the next command in the queue if available.
        const nextCmd = localQueue.shift();
        if (nextCmd) {
          sendNextCommand(nextCmd);
        }
      };

      const onPoint = (pointData) => {
        clearTimeoutHandle();
        logger.info(`Received measurement for point ${pointName}: ${pointData}`);
        // Parse the measurement string.
        // Expected format: "TS0007,8.1234,3.4567,9.8765,25.02.2025,07:15:43.980,1157401"
        const parts = pointData.split(',');
        if (parts.length < 4) {
          logger.error(`Invalid measurement format for point ${pointName}: ${pointData}`);
          cleanupAndReject(new Error('Invalid measurement format'));
          return;
        }
        // Extract x, y, and z from the string.
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        const z = parseFloat(parts[3]);
        this.measuredResults[pointName] = { x, y, z };
        cleanupAndResolve();
      };

      const onEnd = () => {
        clearTimeoutHandle();
        cleanupAndReject(new Error('Measurement ended unexpectedly.'));
      };

      const sendNextCommand = (cmd) => {
        currentCommand = cmd;
        logger.info(`Sending command for point ${pointName}: ${cmd.trim()}`);
        this.streamer.send(cmd);
        resetTimeout(() => {
          cleanupAndReject(new Error('Timed out waiting for device response.'));
        });
      };

      const cleanupAndResolve = () => {
        this.streamer.removeListener('streaming-response', onResponse);
        this.streamer.removeListener('point', onPoint);
        this.streamer.removeListener('end', onEnd);
        resolve();
      };

      const cleanupAndReject = (err) => {
        this.streamer.removeListener('streaming-response', onResponse);
        this.streamer.removeListener('point', onPoint);
        this.streamer.removeListener('end', onEnd);
        reject(err);
      };

      // Attach event listeners.
      this.streamer.on('streaming-response', onResponse);
      this.streamer.on('point', onPoint);
      this.streamer.on('end', onEnd);

      const firstCmd = localQueue.shift();
      if (!firstCmd) {
        return reject(new Error('No commands to send for measurement.'));
      }
      sendNextCommand(firstCmd);
    });
  }

  async #writeMeasuredData() {
    // Use the panel ID (or a default) as the document ID.
    const panelId = this.data.panel || 'Unknown-Panel';
    const panelPointsRef = doc(collection(db, 'panel-points'), panelId);
    const payload = {
      id: panelId, // Use the panel id as the document id property.
      measured: this.measuredResults,
      panelId: panelId,
      sessionId: this.data.sessionId || 'Unknown-Session',
      updatedAt: new Date(),
    };
    try {
      // Use merge: true so that if the document already exists, it gets updated.
      await setDoc(panelPointsRef, payload, { merge: true });
      logger.info(
        `Measured data updated for panel-points/${panelId}: ${JSON.stringify(payload)}`
      );
    } catch (err) {
      logger.error('Error writing measured data:', err);
      throw err;
    }
  }
  

  async #markAsInvoked() {
    try {
      if (!this.data.id) {
        logger.error('No command document ID provided; cannot mark as invoked.');
        return;
      }
      const cmdRef = doc(collection(db, 'commands'), this.data.id);
      await setDoc(cmdRef, { isInvoked: true }, { merge: true });
      logger.info(`Marked command ${this.data.id} as invoked.`);
    } catch (err) {
      logger.error('Error marking command as invoked:', err);
    }
  }
}
