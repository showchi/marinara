import * as AudioPlayback from '../AudioPlayback';
import createTimerSound from '../TimerSound';
import { TARGET } from '../AudioMessages';

let timerSound = null;

async function closeTimerSound() {
  if (!timerSound) {
    return;
  }

  await timerSound.close();
  timerSound = null;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || message.target !== TARGET) {
    return;
  }

  (async () => {
    switch (message.command) {
      case 'play':
        await AudioPlayback.play(message.filename);
        break;

      case 'startTimerSound':
        await closeTimerSound();
        if (message.timerSound) {
          timerSound = await createTimerSound(message.timerSound);
          await timerSound.start();
        }
        break;

      case 'stopTimerSound':
      case 'closeTimerSound':
        await closeTimerSound();
        break;

      case 'pauseTimerSound':
        timerSound && await timerSound.stop();
        break;

      case 'resumeTimerSound':
        if (!timerSound && message.timerSound) {
          timerSound = await createTimerSound(message.timerSound);
        }
        timerSound && await timerSound.start();
        break;

      default:
        throw new Error(`Unknown audio command: ${message.command}.`);
    }

    respond({ result: true });
  })().catch(error => {
    console.error(error);
    respond({ error: `${error}` });
  });

  return true;
});
