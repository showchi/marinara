import Chrome from './Chrome';

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
    source.onended = () => {
      context.close();
      resolve();
    };
    source.start();
  });
}

export {
  play
};
