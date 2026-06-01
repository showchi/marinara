import { assert } from 'chai';
import { AudioController } from '@/background/AudioController';
import { TARGET } from '@/AudioMessages';

describe('AudioController resource usage', () => {
  let originalChrome;
  let contexts;
  let createdDocuments;
  let sentMessages;

  beforeEach(() => {
    originalChrome = global.chrome;
    contexts = [];
    createdDocuments = [];
    sentMessages = [];

    global.chrome = {
      runtime: {
        getURL: path => `chrome-extension://test/${path}`,
        getContexts: async () => contexts,
        sendMessage: async message => {
          sentMessages.push(message);
          return { result: true };
        }
      },
      offscreen: {
        createDocument: async options => {
          createdDocuments.push(options);
          contexts.push({ documentUrl: options.url });
        }
      }
    };
  });

  afterEach(() => {
    global.chrome = originalChrome;
  });

  it('does not create an offscreen document for timer-sound cleanup when none exists', async () => {
    let audio = new AudioController();

    await audio.pauseTimerSound();
    await audio.closeTimerSound();
    await audio.resumeTimerSound();

    assert.isEmpty(createdDocuments);
    assert.isEmpty(sentMessages);
  });

  it('sends timer-sound cleanup commands to an existing offscreen document', async () => {
    contexts.push({ documentUrl: 'chrome-extension://test/modules/offscreen.html' });
    let audio = new AudioController();

    await audio.pauseTimerSound();
    await audio.closeTimerSound();
    await audio.resumeTimerSound();

    assert.isEmpty(createdDocuments);
    assert.deepEqual(sentMessages, [
      { target: TARGET, command: 'pauseTimerSound' },
      { target: TARGET, command: 'closeTimerSound' },
      { target: TARGET, command: 'resumeTimerSound', timerSound: null }
    ]);
  });

  it('creates an offscreen document when starting a timer sound', async () => {
    let audio = new AudioController();
    let timerSound = {
      procedural: 'white-noise'
    };

    await audio.startTimerSound(timerSound);

    assert.lengthOf(createdDocuments, 1);
    assert.deepInclude(createdDocuments[0], {
      url: 'modules/offscreen.html',
      reasons: ['AUDIO_PLAYBACK']
    });
    assert.deepEqual(sentMessages, [
      { target: TARGET, command: 'startTimerSound', timerSound }
    ]);
  });

  it('sends cleanup after in-flight offscreen document creation finishes', async () => {
    let finishCreateDocument = null;
    chrome.offscreen.createDocument = async options => {
      createdDocuments.push(options);
      await new Promise(resolve => {
        finishCreateDocument = resolve;
      });
      contexts.push({ documentUrl: chrome.runtime.getURL(options.url) });
    };
    let audio = new AudioController();
    let timerSound = {
      procedural: 'white-noise'
    };

    let start = audio.startTimerSound(timerSound);
    while (createdDocuments.length === 0) {
      await Promise.resolve();
    }
    let pause = audio.pauseTimerSound();
    await Promise.resolve();

    assert.lengthOf(createdDocuments, 1);
    assert.isEmpty(sentMessages);

    finishCreateDocument();
    await Promise.all([start, pause]);

    assert.deepEqual(sentMessages, [
      { target: TARGET, command: 'startTimerSound', timerSound },
      { target: TARGET, command: 'pauseTimerSound' }
    ]);
  });
});
