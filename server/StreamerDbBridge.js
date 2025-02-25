// server/StreamerDbBridge.js
import { CommandQueue } from './helpers/CommandQueue.js';
import { MultiPointCommand } from './models/MultiPointCommand.js';
import { Command } from './models/Command.js';

class StreamerDbBridge {
  constructor(streamer, session, logger) {
    this.streamer = streamer;
    this.session = session;
    this.commandQueue = new CommandQueue(this.streamer);
    this.logger = logger;
    this.isStarting = false; // Guard flag to prevent recursive starts.
  }

  /**
   * Starts the bridge by connecting the streamer and initializing the session.
   */
  async start() {
    if (this.isStarting) {
      this.logger.warn('StreamerDbBridge is already starting. Skipping redundant start.');
      return;
    }
    this.isStarting = true;
    try {
      await this.streamer.connect();
      await this.session.init();
      // Clear any pending old commands.
      await this.session.clearPendingCommands();
      // Start the stream.
      this.streamer.send('%R8Q,5:\r\n'); // Stop stream.
      this.streamer.send('%R8Q,4:\r\n'); // Start stream.

      // Listen for new commands from Firestore.
      this.session.onCommandCreated((data) => {
        this.logger.info(`Command created with id: ${data.id}`);
        let command;
        if (data.ToMeasure) {
          // Use the multi‑point command if ToMeasure exists.
          command = new MultiPointCommand(this.streamer, data);
        } else {
          // Otherwise, use the legacy single‑point Command.
          command = new Command(this.streamer, this.session, data);
        }
        this.commandQueue.addCommand(command);
      });

      // Listen for data points from the streamer.
      this.streamer.on('point', (point) => {
        if (this.commandQueue.isInProgress) return;
        this.logger.info(`Received point: "${point}"`);
        this.session.addPoint(point);
      });

      // Handle streamer reset events.
      this.streamer.on('reset', () => {
        this.logger.warn('Resetting Streamer...');
        setTimeout(() => {
          this.commandQueue.clearCommandQueue();
          if (this.streamer.socket) {
            this.streamer.socket.end();
            this.streamer.socket.destroy();
          }
          this.start(); // Restart the bridge.
          this.logger.info('Streamer restarted.');
        }, 2000);
      });

      // Only set up the timeout handler if the streamer has a socket.
      if (this.streamer.socket && typeof this.streamer.socket.once === 'function') {
        this.streamer.socket.once('timeout', () => {
          this.logger.error('Socket timeout occurred. Attempting to reconnect...');
          this.commandQueue.clearCommandQueue();
          if (this.streamer.socket) {
            this.streamer.socket.end();
            this.streamer.socket.destroy();
          }
          this.start();
        });
      }
    } catch (error) {
      this.logger.error(`Error in StreamerDbBridge start: ${error.message}`);
    } finally {
      this.isStarting = false;
    }
  }
}

export { StreamerDbBridge };
