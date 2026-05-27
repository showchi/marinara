import { PomodoroTimer, TimerState } from './Timer';

const TIMER_STATE_KEY = 'timer';

class TimerStateStore
{
  constructor({ settings, storage = null, now = () => Date.now() }) {
    this.settings = settings;
    this.storage = storage;
    this.now = now;
    this.saveQueue = Promise.resolve();
  }

  async load({ processExpired = true, arm = true } = {}) {
    let snapshot = await this.loadSnapshot();
    if (!snapshot) {
      return {
        timer: new PomodoroTimer(this.settings, undefined, undefined, this.now),
        expired: false
      };
    }

    return this.restore(snapshot, { processExpired, arm });
  }

  async loadSnapshot() {
    if (!this.storage) {
      return null;
    }

    let payload = await this.storage.get(TIMER_STATE_KEY);
    return payload && payload[TIMER_STATE_KEY] || null;
  }

  async save(timer) {
    if (!this.storage) {
      return;
    }

    let snapshot = timer.toJSON();
    this.saveQueue = this.saveQueue
      .then(() => this.storage.set({
        [TIMER_STATE_KEY]: snapshot
      }))
      .catch(error => console.error(error));

    return this.saveQueue;
  }

  async flush() {
    await this.saveQueue;
  }

  restore(snapshot, { processExpired = true, arm = true } = {}) {
    let timer = PomodoroTimer.fromJSON(this.settings, snapshot, undefined, this.now, { arm });
    let expired = false;

    if (timer.state === TimerState.Running && timer.remaining <= 0) {
      expired = true;
      if (processExpired) {
        timer.expire();
      }
    }

    return { timer, expired };
  }
}

export {
  TIMER_STATE_KEY,
  TimerStateStore
};

export default TimerStateStore;
