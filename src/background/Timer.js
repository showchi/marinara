import Enum from './Enum';
import EventEmitter from 'events';

const TimerState = new Enum({
  Stopped: 0,
  Running: 1,
  Paused: 2
});

function enumValue(enumeration, value) {
  for (let key of enumeration.keys()) {
    let option = enumeration[key];
    if (option.valueOf() === value) {
      return option;
    }
  }

  throw new Error(`Invalid enum value: ${value}.`);
}

class Timer extends EventEmitter
{
  constructor(duration, tick, now = () => Date.now()) {
    super();

    this.state = TimerState.Stopped;
    this.duration = duration;
    this.tick = tick;
    this.now = now;

    this.tickInterval = null;
    this.expireTimeout = null;

    this.checkpointStartAt = null;
    this.checkpointElapsed = 0;
  }

  observe(observer) {
    observer.onStart && this.on('start', (...args) => observer.onStart(...args));
    observer.onStop && this.on('stop', (...args) => observer.onStop(...args));
    observer.onPause && this.on('pause', (...args) => observer.onPause(...args));
    observer.onResume && this.on('resume', (...args) => observer.onResume(...args));
    observer.onTick && this.on('tick', (...args) => observer.onTick(...args));
    observer.onExpire && this.on('expire', (...args) => observer.onExpire(...args));
  }

  get isStopped() {
    return this.state === TimerState.Stopped;
  }

  get isRunning() {
    return this.state === TimerState.Running;
  }

  get isPaused() {
    return this.state === TimerState.Paused;
  }

  get remaining() {
    return this.duration - this.elapsed;
  }

  get elapsed() {
    let periodElapsed = 0;
    if (this.checkpointStartAt && this.isRunning) {
      periodElapsed = (this.now() - this.checkpointStartAt) / 1000;
    }
    return this.checkpointElapsed + periodElapsed;
  }

  get status() {
    let expiresAt = null;
    if (this.isRunning && this.checkpointStartAt) {
      expiresAt = this.checkpointStartAt + ((this.duration - this.checkpointElapsed) * 1000);
    }

    return {
      state: this.state,
      duration: this.duration,
      elapsed: this.elapsed,
      remaining: this.remaining,
      expiresAt,
      checkpointElapsed: this.checkpointElapsed,
      checkpointStartAt: this.checkpointStartAt
    };
  }

  start() {
    if (!this.isStopped) {
      return;
    }

    this.setExpireTimeout(this.duration);
    this.setTickInterval(this.tick);

    this.state = TimerState.Running;
    this.checkpointStartAt = this.now();

    this.emit('start', this.status);
  }

  stop() {
    if (this.isStopped) {
      return;
    }

    clearInterval(this.tickInterval);
    clearTimeout(this.expireTimeout);

    this.tickInterval = null;
    this.expireTimeout = null;
    this.checkpointStartAt = null;
    this.checkpointElapsed = 0;

    this.state = TimerState.Stopped;

    this.emit('stop', this.status);
  }

  pause() {
    if (!this.isRunning) {
      return;
    }

    clearInterval(this.tickInterval);
    clearTimeout(this.expireTimeout);

    let periodElapsed = (this.now() - this.checkpointStartAt) / 1000;
    this.checkpointElapsed += periodElapsed;

    this.state = TimerState.Paused;

    this.emit('pause', this.status);
  }

  resume() {
    if (!this.isPaused) {
      return;
    }

    this.setExpireTimeout(this.remaining);
    this.setTickInterval(this.tick);

    this.state = TimerState.Running;
    this.checkpointStartAt = this.now();

    this.emit('resume', this.status);
  }

  restart() {
    this.stop();
    this.start();
  }

  setExpireTimeout(seconds) {
    this.expireTimeout = setTimeout(async () => {
      clearInterval(this.tickInterval);
      clearTimeout(this.expireTimeout);

      this.tickInterval = null;
      this.expireTimeout = null;
      this.checkpointStartAt = this.now();
      this.checkpointElapsed = this.duration;

      this.state = TimerState.Stopped;

      await this.emitAsync('expire', this.status);
    }, seconds * 1000);
  }

  setTickInterval(seconds) {
    this.tickInterval = setInterval(() => {
      this.emit('tick', this.status);
    }, seconds * 1000);
  }

  restore(snapshot, { arm = true } = {}) {
    clearInterval(this.tickInterval);
    clearTimeout(this.expireTimeout);

    this.tickInterval = null;
    this.expireTimeout = null;
    this.state = enumValue(TimerState, snapshot.state);
    if (!this.isStopped) {
      this.duration = snapshot.duration;
    }
    this.checkpointStartAt = snapshot.checkpointStartAt || null;
    this.checkpointElapsed = snapshot.checkpointElapsed || 0;

    if (arm && this.isRunning && this.remaining > 0) {
      this.setExpireTimeout(this.remaining);
      this.setTickInterval(this.tick);
    }
  }

  arm() {
    if (!this.isRunning || this.expireTimeout || this.remaining <= 0) {
      return;
    }

    this.setExpireTimeout(this.remaining);
    this.setTickInterval(this.tick);
  }

  tickNow() {
    if (!this.isRunning) {
      return;
    }

    this.emit('tick', this.status);
  }

  async emitAsync(event, ...args) {
    let listeners = this.rawListeners ? this.rawListeners(event) : this.listeners(event);
    await Promise.all(listeners.map(listener => listener.apply(this, args)));
  }

  toJSON() {
    return this.status;
  }
}

const Phase = new Enum({
  Focus: 0,
  ShortBreak: 1,
  LongBreak: 2
});

class PomodoroTimer extends EventEmitter
{
  constructor(settings, initialPhase = Phase.Focus, timerType = Timer, now = () => Date.now()) {
    super();
    this.timerType = timerType;
    this.now = now;
    this.advanceTimer = false;
    this.pomodoros = 0;
    this.settings = settings;
    this.phase = initialPhase;
  }

  _updateTimer() {
    let { duration } = {
      [Phase.Focus]: this.settings.focus,
      [Phase.ShortBreak]: this.settings.shortBreak,
      [Phase.LongBreak]: this.settings.longBreak
    }[this.phase];

    if (this.timer) {
      this.timer.stop();
      this.timer.removeAllListeners();
    }

    this.timer = new this.timerType(Math.floor(duration * 60), 60, this.now);
    this.timer.observe(this);
  }

  get phase() {
    return this._phase;
  }

  set phase(newPhase) {
    if (!this.hasLongBreak && newPhase === Phase.LongBreak) {
      throw new Error('No long break interval defined.');
    }

    this._phase = newPhase;
    this._updateTimer();
    this.advanceTimer = false;
  }

  get nextPhase() {
    if (this.phase === Phase.ShortBreak || this.phase === Phase.LongBreak) {
      return Phase.Focus;
    }

    if (!this.hasLongBreak) {
      return Phase.ShortBreak;
    }

    let completedPomodoros = this.pomodoros + (this.isRunning || this.isPaused ? 1 : 0);
    if (this._pomodorosUntilLongBreak(completedPomodoros) === 0) {
      return Phase.LongBreak;
    } else {
      return Phase.ShortBreak;
    }
  }

  get hasLongBreak() {
    return this.settings.longBreak.interval > 0;
  }

  get pomodorosUntilLongBreak() {
    return this._pomodorosUntilLongBreak(this.pomodoros);
  }

  _pomodorosUntilLongBreak(pomodoros) {
    let { interval } = this.settings.longBreak;
    if (!interval) {
      return null;
    }

    return interval - ((pomodoros - 1) % interval) - 1;
  }

  get remaining() {
    return this.timer.remaining;
  }

  get elapsed() {
    return this.timer.elapsed;
  }

  get state() {
    return this.timer.state;
  }

  get isRunning() {
    return this.timer.isRunning;
  }

  get isStopped() {
    return this.timer.isStopped;
  }

  get isPaused() {
    return this.timer.isPaused;
  }

  get status() {
    return {
      phase: this.phase,
      nextPhase: this.nextPhase,
      pomodoros: this.pomodoros,
      advanceTimer: this.advanceTimer,
      ...this.timer.status
    };
  }

  dispose() {
    this.timer.stop();
    this.timer.removeAllListeners();
  }

  startCycle() {
    this.pomodoros = 0;
    this.phase = Phase.Focus;
    this.start();
  }

  startFocus() {
    this.phase = Phase.Focus;
    this.start();
  }

  startShortBreak() {
    this.phase = Phase.ShortBreak;
    this.start();
  }

  startLongBreak() {
    this.phase = Phase.LongBreak;
    this.start();
  }

  start() {
    if (this.advanceTimer) {
      this._phase = this.nextPhase;
      this.advanceTimer = false;
    }

    this._updateTimer();
    this.timer.start();
  }

  pause() {
    return this.timer.pause();
  }

  stop() {
    return this.timer.stop();
  }

  resume() {
    return this.timer.resume();
  }

  restart() {
    // Calling timer.restart directly would ignore any settings changes, so
    // so we call start then stop to ensure we pick up on the changes.
    this.stop();
    return this.start();
  }

  observe(observer) {
    observer.onStart && this.on('start', (...args) => observer.onStart(...args));
    observer.onStop && this.on('stop', (...args) => observer.onStop(...args));
    observer.onPause && this.on('pause', (...args) => observer.onPause(...args));
    observer.onResume && this.on('resume', (...args) => observer.onResume(...args));
    observer.onTick && this.on('tick', (...args) => observer.onTick(...args));
    observer.onExpire && this.on('expire', (...args) => observer.onExpire(...args));
  }

  onStart(status) {
    this.emit('start', { phase: this.phase, nextPhase: this.nextPhase, ...status });
  }

  onStop(status) {
    this.emit('stop', { phase: this.phase, nextPhase: this.nextPhase, ...status });
  }

  onPause(status) {
    this.emit('pause', { phase: this.phase, nextPhase: this.nextPhase, ...status });
  }

  onResume(status) {
    this.emit('resume', { phase: this.phase, nextPhase: this.nextPhase, ...status });
  }

  onTick(status) {
    this.emit('tick', { phase: this.phase, nextPhase: this.nextPhase, ...status });
  }

  onExpire(status) {
    if (this.phase === Phase.Focus) {
      this.pomodoros++;
    }

    this.advanceTimer = true;
    return this.emitAsync('expire', { phase: this.phase, nextPhase: this.nextPhase, ...status });
  }

  expire() {
    clearInterval(this.timer.tickInterval);
    clearTimeout(this.timer.expireTimeout);

    this.timer.tickInterval = null;
    this.timer.expireTimeout = null;
    this.timer.checkpointStartAt = this.now();
    this.timer.checkpointElapsed = this.timer.duration;
    this.timer.state = TimerState.Stopped;

    return this.onExpire(this.timer.status);
  }

  async emitAsync(event, ...args) {
    let listeners = this.rawListeners ? this.rawListeners(event) : this.listeners(event);
    await Promise.all(listeners.map(listener => listener.apply(this, args)));
  }

  restore(snapshot, { arm = true } = {}) {
    this._phase = enumValue(Phase, snapshot.phase);
    this.advanceTimer = !!snapshot.advanceTimer;
    this.pomodoros = snapshot.pomodoros || 0;
    this._updateTimer();
    this.timer.restore(snapshot, { arm });
  }

  arm() {
    this.timer.arm();
  }

  tickNow() {
    this.timer.tickNow();
  }

  toJSON() {
    return {
      ...this.status,
      state: this.state.valueOf(),
      phase: this.phase.valueOf(),
      nextPhase: this.nextPhase.valueOf()
    };
  }

  static fromJSON(settings, snapshot, timerType = Timer, now = () => Date.now(), options = {}) {
    let timer = new PomodoroTimer(settings, enumValue(Phase, snapshot.phase), timerType, now);
    timer.restore(snapshot, options);
    return timer;
  }
}

export {
  Timer,
  TimerState,
  Phase,
  PomodoroTimer
};
