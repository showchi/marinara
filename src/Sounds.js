import Chrome from './Chrome';
import { notification, timer } from './SoundCatalog';

async function play(filename) {
  if (!filename) {
    return;
  }

  // We use AudioContext instead of Audio since it works more
  // reliably in different browsers (Chrome, FF, Brave).
  let context = new AudioContext();

  let source = context.createBufferSource();
  source.connect(context.destination);
  source.buffer = await new Promise(async (resolve, reject) => {
    let content = await Chrome.files.readBinary(filename);
    context.decodeAudioData(content, buffer => resolve(buffer), error => reject(error));
  });

  await new Promise(resolve => {
    // Cleanup audio context after sound plays.
    source.onended = () => {
      context.close();
      resolve();
    }
    source.start();
  });
}

export {
  notification,
  timer,
  play
};
