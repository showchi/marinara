import M from '../Messages';
import { Phase } from './Timer';
import { pomodoroCount } from '../Filters';
import Notification from './Notification';
import { ExpirationPage } from './Expiration';
import Mutex from '../Mutex';
import { SingletonPage, PageHost } from './SingletonPage';
import audio from './AudioController';

class BadgeObserver
{
  onStart({ phase, remaining }) {
    this.updateBadge({ phase, minutes: Math.round(remaining / 60) });
  }

  onTick({ phase, remaining }) {
    this.updateBadge({ phase, minutes: Math.round(remaining / 60) });
  }

  onStop() {
    this.removeBadge();
  }

  onPause({ phase }) {
    this.updateBadge({ phase, text: '—', tooltip: M.timer_paused });
  }

  onResume({ phase, remaining }) {
    this.updateBadge({ phase, minutes: Math.round(remaining / 60) });
  }

  onExpire() {
    this.removeBadge();
  }

  updateBadge({ phase, minutes, tooltip, text }) {
    let title = {
      [Phase.Focus]: M.focus,
      [Phase.ShortBreak]: M.short_break,
      [Phase.LongBreak]: M.long_break
    }[phase];

    if (minutes != null) {
      text = minutes < 1 ? M.less_than_minute : M.n_minutes(minutes);
      tooltip = M.browser_action_tooltip(title, M.time_remaining(text));
    } else {
      tooltip = M.browser_action_tooltip(title, tooltip);
    }

    let color = phase === Phase.Focus ? '#bb0000' : '#11aa11';
    chrome.action.setTitle({ title: tooltip });
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
  }

  removeBadge() {
    chrome.action.setTitle({ title: '' });
    chrome.action.setBadgeText({ text: '' });
  }
}

class TimerSoundObserver
{
  constructor(settings) {
    this.settings = settings;
    this.mutex = new Mutex();
  }

  async onStart({ phase }) {
    let timerSoundSettings = this.settings.focus.timerSound;
    await this.run(async () => {
      if (phase === Phase.Focus && timerSoundSettings) {
        await audio.startTimerSound(timerSoundSettings);
      } else {
        await audio.closeTimerSound();
      }
    });
  }

  async onStop() {
    await this.run(async () => {
      await audio.closeTimerSound();
    });
  }

  async onPause() {
    await this.run(async () => {
      await audio.pauseTimerSound();
    });
  }

  async onResume() {
    await this.run(async () => {
      await audio.resumeTimerSound();
    });
  }

  async onExpire() {
    await this.run(async () => {
      await audio.closeTimerSound();
    });
  }

  async run(fn) {
    try {
      await this.mutex.exclusive(fn);
    } catch (error) {
      console.error(error);
    }
  }
}

class ExpirationSoundObserver
{
  constructor(settings) {
    this.settings = settings;
  }

  async onExpire({ phase }) {
    let sound = s => s && s.notifications.sound;
    let filename = {
      [Phase.Focus]: sound(this.settings.focus),
      [Phase.ShortBreak]: sound(this.settings.shortBreak),
      [Phase.LongBreak]: sound(this.settings.longBreak)
    }[phase];

    if (filename) {
      try {
        await audio.play(filename);
      } catch (error) {
        console.error(error);
      }
    }
  }
}

class NotificationObserver
{
  constructor(timer, settings, history) {
    this.timer = timer;
    this.settings = settings;
    this.history = history;
    this.notification = null;
    this.expiration = null;
    this.mutex = new Mutex();
  }

  onStart() {
    return this.mutex.exclusive(async () => {
      if (this.notification) {
        this.notification.close();
        this.notification = null;
      }

      if (this.expiration) {
        await this.expiration.close();
        this.expiration = null;
      } else {
        await ExpirationPage.closeOpenPages();
      }
    });
  }

  async onExpire({ phase, nextPhase }) {
    let settings = this.settings[{
      [Phase.Focus]: 'focus',
      [Phase.ShortBreak]: 'shortBreak',
      [Phase.LongBreak]: 'longBreak'
    }[phase]];

    let hasLongBreak = this.timer.hasLongBreak;
    let title = {
      [Phase.Focus]: M.start_focusing,
      [Phase.ShortBreak]: hasLongBreak ? M.take_a_short_break : M.take_a_break,
      [Phase.LongBreak]: M.take_a_long_break
    }[nextPhase];

    let buttonText = {
      [Phase.Focus]: M.start_focusing_now,
      [Phase.ShortBreak]: hasLongBreak ? M.start_short_break_now : M.start_break_now,
      [Phase.LongBreak]: M.start_long_break_now
    }[nextPhase];

    let action = {
      [Phase.Focus]: M.start_focusing,
      [Phase.ShortBreak]: hasLongBreak ? M.start_short_break : M.start_break,
      [Phase.LongBreak]: M.start_long_break
    }[nextPhase];

    let messages = [];
    let remaining = this.timer.pomodorosUntilLongBreak;
    if (remaining > 0) {
      messages.push(M.pomodoros_until_long_break(pomodoroCount(remaining)));
    }

    let pomodorosToday = await this.history.countToday();
    messages.push(M.pomodoros_completed_today(pomodoroCount(pomodorosToday)));

    messages = messages.filter(m => !!m);

    await this.mutex.exclusive(async () => {
      if (settings.notifications.desktop) {
        try {
          this.notification = new Notification(title, messages.join('\n'));
          this.notification.addButton(buttonText);
          await this.notification.show();
        } catch (error) {
          console.error(error);
        }
      }

      if (settings.notifications.tab) {
        try {
          let phaseId = {
            [Phase.Focus]: 'focus',
            [Phase.ShortBreak]: hasLongBreak ? 'short-break' : 'break',
            [Phase.LongBreak]: 'long-break'
          }[nextPhase];

          this.expiration = await ExpirationPage.show(
            title,
            messages,
            action,
            pomodorosToday,
            phaseId
          );
        } catch (error) {
          console.error(error);
        }
      }
    });
  }
}

class HistoryObserver
{
  constructor(history) {
    this.history = history;
  }

  async onExpire({ phase, duration }) {
    if (phase !== Phase.Focus) {
      return;
    }

    await this.history.addPomodoro(duration);
  }
}

class CountdownObserver
{
  constructor(settings) {
    this.settings = settings;
  }

  async onStart({ phase }) {
    let settings = this.settings[{
      [Phase.Focus]: 'focus',
      [Phase.ShortBreak]: 'shortBreak',
      [Phase.LongBreak]: 'longBreak'
    }[phase]];

    let { host, resolution } = settings.countdown;
    if (!host) {
      return;
    }

    let page = null;
    let url = chrome.runtime.getURL('modules/countdown.html');

    if (host === 'tab') {
      page = await SingletonPage.show(url, PageHost.Tab);
      page.focus();
      return;
    }

    if (host !== 'window') {
      return;
    }

    let properties = {};
    if (resolution === 'fullscreen') {
      properties = { state: 'maximized' };
    } else if (Array.isArray(resolution)) {
      let [windowWidth, windowHeight] = resolution;
      properties = { width: windowWidth, height: windowHeight };
    }

    page = await SingletonPage.show(url, PageHost.Window, properties);
    page.focus();
  }
}

class MenuObserver
{
  constructor(menu) {
    this.menu = menu;
  }

  onStart() {
    this.menu.apply();
  }

  onStop() {
    this.menu.apply();
  }

  onPause() {
    this.menu.apply();
  }

  onResume() {
    this.menu.apply();
  }

  onExpire() {
    this.menu.apply();
  }
}

class TraceObserver
{
  onStart(...args) {
    console.log('start', ...args);
  }

  onStop(...args) {
    console.log('stop', ...args);
  }

  onPause(...args) {
    console.log('pause', ...args);
  }

  onResume(...args) {
    console.log('resume', ...args);
  }

  onTick(...args) {
    console.log('tick', ...args);
  }

  onExpire(...args) {
    console.log('expire', ...args);
  }
}

export {
  BadgeObserver,
  TimerSoundObserver,
  ExpirationSoundObserver,
  NotificationObserver,
  HistoryObserver,
  CountdownObserver,
  MenuObserver,
  TraceObserver
};
