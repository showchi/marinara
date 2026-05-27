import { assert } from 'chai';
import { Phase, TimerState } from '@/background/Timer';

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
});
