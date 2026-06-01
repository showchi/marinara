import { TARGET } from '../AudioMessages';

class AudioController
{
  constructor() {
    this.createDocumentPromise = null;
    this.timerSound = null;
    this.commandQueue = Promise.resolve();
  }

  async play(filename) {
    if (!filename) {
      return;
    }

    await this.send({ command: 'play', filename });
  }

  async startTimerSound(timerSound) {
    this.timerSound = timerSound;
    await this.send({ command: 'startTimerSound', timerSound });
  }

  async stopTimerSound() {
    await this.sendIfDocumentExists({ command: 'stopTimerSound' });
  }

  async pauseTimerSound() {
    await this.sendIfDocumentExists({ command: 'pauseTimerSound' });
  }

  async closeTimerSound() {
    this.timerSound = null;
    await this.sendIfDocumentExists({ command: 'closeTimerSound' });
  }

  async send(message) {
    return await this.enqueueCommand(async () => {
      await this.ensureDocument();
      return await this.sendMessage(message);
    });
  }

  async sendIfDocumentExists(message) {
    return await this.enqueueCommand(async () => {
      if (!await this.hasDocument()) {
        return;
      }

      return await this.sendMessage(message);
    });
  }

  async enqueueCommand(fn) {
    let command = this.commandQueue.then(fn, fn);
    this.commandQueue = command.catch(() => {});
    return await command;
  }

  async sendMessage(message) {
    let response = await chrome.runtime.sendMessage({
      target: TARGET,
      ...message
    });

    if (!response) {
      throw new Error(`No response for audio command: ${message.command}.`);
    }

    if (response.error) {
      throw new Error(response.error);
    }

    return response.result;
  }

  async ensureDocument() {
    if (await this.hasDocument()) {
      return;
    }

    if (!this.createDocumentPromise) {
      this.createDocumentPromise = chrome.offscreen.createDocument({
        url: 'modules/offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Marinara plays timer and notification sounds while timers run.'
      }).finally(() => {
        this.createDocumentPromise = null;
      });
    }

    await this.createDocumentPromise;
  }

  async hasDocument() {
    let contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('modules/offscreen.html')]
    });
    return contexts.length > 0;
  }

  async resumeTimerSound() {
    let message = {
      command: 'resumeTimerSound',
      timerSound: this.timerSound
    };

    if (this.timerSound) {
      await this.send(message);
    } else {
      await this.sendIfDocumentExists(message);
    }
  }
}

const audio = new AudioController();

export {
  AudioController
};

export default audio;
