const { spawnSync } = require('child_process');

// Webpack 4 needs MD4. Keep the OpenSSL 3 workaround local to these commands,
// including the child process started by the unit-test runner.
const env = { ...process.env };
if (parseInt(process.versions.openssl, 10) >= 3) {
  env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --openssl-legacy-provider`.trim();
}

const result = spawnSync(process.execPath, [
  require.resolve('@vue/cli-service/bin/vue-cli-service.js'),
  ...process.argv.slice(2)
], { env, stdio: 'inherit' });

if (result.error) {
  console.error(result.error);
}
if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exitCode = result.status === null ? 1 : result.status;
}
