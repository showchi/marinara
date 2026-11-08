import { assert } from 'chai';
import { Phase, TimerState } from '@/background/Timer';
import Chrome from '@/Chrome';

function loadTimerStateStore() {
  let module;
  try {
    module = require('@/background/TimerStateStore');
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('TimerStateStore')) {
      assert.fail(`TimerStateStore module is not implemented yet: ${error.message}`);
    }
    throw error;
  }

  let TimerStateStore = module.default || module.TimerStateStore;
  assert.isFunction(TimerStateStore, 'TimerStateStore module should export a TimerStateStore class');
  return TimerStateStore;
}

describe('TimerStateStore', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  const settings = {
    focus: { duration: 25 },
    shortBreak: { duration: 5 },
    longBreak: { duration: 15, interval: 4 }
  };

  function runningFocusSnapshot(overrides = {}) {
    return {
      phase: Phase.Focus.valueOf(),
      nextPhase: Phase.ShortBreak.valueOf(),
      state: TimerState.Running.valueOf(),
      duration: 25 * 60,
      checkpointStartAt: now - (23 * 60 * 1000),
      checkpointElapsed: 0,
      pomodoros: 0,
      ...overrides
    };
  }

  it('restores a running timer when worker restarts before expiry', () => {
    let TimerStateStore = loadTimerStateStore();
    let store = new TimerStateStore({ settings, now: () => now });

    let restored = null;
    try {
      restored = store.restore(runningFocusSnapshot());

      assert.isFalse(restored.expired);
      assert.equal(restored.timer.phase, Phase.Focus);
      assert.equal(restored.timer.nextPhase, Phase.ShortBreak);
      assert.equal(restored.timer.state, TimerState.Running);
      assert.closeTo(restored.timer.remaining, 2 * 60, 1);
    } finally {
      restored && restored.timer.dispose();
    }
  });

  it('marks a running timer expired when worker restarts after expiry', () => {
    let TimerStateStore = loadTimerStateStore();
    let store = new TimerStateStore({ settings, now: () => now });

    let restored = store.restore(runningFocusSnapshot({
      checkpointStartAt: now - (26 * 60 * 1000)
    }));

    assert.isTrue(restored.expired);
    assert.equal(restored.timer.phase, Phase.Focus);
    assert.equal(restored.timer.nextPhase, Phase.ShortBreak);
    assert.equal(restored.timer.state, TimerState.Stopped);
    assert.equal(restored.timer.pomodoros, 1);
  });

  it('restores a paused timer without advancing elapsed time', () => {
    let TimerStateStore = loadTimerStateStore();
    let store = new TimerStateStore({ settings, now: () => now });

    let restored = store.restore(runningFocusSnapshot({
      state: TimerState.Paused.valueOf(),
      checkpointStartAt: null,
      checkpointElapsed: 7 * 60
    }));

    assert.isFalse(restored.expired);
    assert.equal(restored.timer.phase, Phase.Focus);
    assert.equal(restored.timer.state, TimerState.Paused);
    assert.closeTo(restored.timer.remaining, 18 * 60, 1);
    assert.deepInclude(restored.timer.toJSON(), {
      checkpointStartAt: null,
      checkpointElapsed: 7 * 60
    });
  });

  it('refreshes stopped timer duration when settings changed while worker was stopped', () => {
    let TimerStateStore = loadTimerStateStore();
    let updatedSettings = {
      focus: { duration: 10 },
      shortBreak: { duration: 5 },
      longBreak: { duration: 15, interval: 4 }
    };
    let store = new TimerStateStore({ settings: updatedSettings, now: () => now });

    let restored = store.restore(runningFocusSnapshot({
      state: TimerState.Stopped.valueOf(),
      duration: 25 * 60,
      checkpointStartAt: null,
      checkpointElapsed: 0
    }));

    assert.isFalse(restored.expired);
    assert.equal(restored.timer.phase, Phase.Focus);
    assert.equal(restored.timer.state, TimerState.Stopped);
    assert.equal(restored.timer.remaining, 10 * 60);
  });

  describe('browser session storage', () => {
    let originalChrome;
    let originalSession;
    let originalLocal;
    let session;
    let local;

    function storageArea(data) {
      return {
        get: (keys, callback) => {
          let result = {};
          for (let key of Array.isArray(keys) ? keys : [keys]) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
              result[key] = data[key];
            }
          }
          callback(result);
        },
        set: (values, callback) => {
          Object.assign(data, JSON.parse(JSON.stringify(values)));
          callback();
        },
        remove: (key, callback) => {
          delete data[key];
          callback();
        }
      };
    }

    beforeEach(() => {
      originalChrome = global.chrome;
      originalSession = Chrome.storage._session;
      originalLocal = Chrome.storage._local;
      delete Chrome.storage._session;
      delete Chrome.storage._local;
      session = {};
      local = {
        timer: runningFocusSnapshot({ checkpointStartAt: now - 36 * 60 * 60 * 1000 }),
        pomodoros: [12345],
        settings: { enabled: true }
      };
      global.chrome = {
        runtime: { lastError: null },
        storage: { session: storageArea(session), local: storageArea(local) }
      };
    });

    afterEach(() => {
      global.chrome = originalChrome;
      Chrome.storage._session = originalSession;
      Chrome.storage._local = originalLocal;
    });

    it('retains running and paused snapshots when a new worker reads the same session', async () => {
      let TimerStateStore = loadTimerStateStore();
      for (let state of [TimerState.Running, TimerState.Paused]) {
        let first = new TimerStateStore({ settings, storage: Chrome.storage.session, now: () => now });
        let { timer } = first.restore(runningFocusSnapshot({ state: state.valueOf() }), { arm: false });
        await first.save(timer);

        let nextWorker = new TimerStateStore({ settings, storage: Chrome.storage.session, now: () => now });
        let restored = await nextWorker.load({ arm: false });

        assert.equal(restored.timer.state, state);
        assert.equal(restored.timer.remaining, timer.remaining);
        assert.isFalse(restored.expired);
      }
    });

    it('starts fresh after session storage is cleared even if an old local snapshot exists', async () => {
      let TimerStateStore = loadTimerStateStore();
      session.timer = runningFocusSnapshot();
      // Chrome clears this storage area on browser restart or extension reload.
      delete session.timer;
      let nextBrowser = new TimerStateStore({ settings, storage: Chrome.storage.session, now: () => now });

      let restored = await nextBrowser.load({ arm: false });

      assert.isFalse(restored.expired);
      assert.equal(restored.timer.state, TimerState.Stopped);
      assert.equal(restored.timer.pomodoros, 0);
      assert.deepEqual(local.pomodoros, [12345]);
    });

    it('removes only the legacy timer key, leaving history and other local data intact', async () => {
      await Chrome.storage.local.remove('timer');

      assert.deepEqual(local, { pomodoros: [12345], settings: { enabled: true } });
    });
  });
});
