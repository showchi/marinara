import { TARGET } from '../AudioMessages';

class AudioController
{
  constructor() {
    this.createDocumentPromise = null;
    this.timerSound = null;
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
    await this.send({ command: 'stopTimerSound' });
  }

  async pauseTimerSound() {
    await this.send({ command: 'pauseTimerSound' });
  }

  async closeTimerSound() {
    this.timerSound = null;
    await this.send({ command: 'closeTimerSound' });
  }

  async send(message) {
    await this.ensureDocument();
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
    await this.send({
      command: 'resumeTimerSound',
      timerSound: this.timerSound
    });
  }
}

const audio = new AudioController();

export {
  AudioController
};

export default audio;
