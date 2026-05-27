import Chrome from '../Chrome';
import { Phase } from './Timer';
import { createPomodoroMenu } from './Menu';
import { History } from './History';
import StorageManager from './StorageManager';
import { SettingsSchema, PersistentSettings } from './Settings';
import TimerStateStore from './TimerStateStore';
import { HistoryService, SoundsService, SettingsService, PomodoroService, OptionsService } from './Services';
import { BadgeObserver, TimerSoundObserver, ExpirationSoundObserver, NotificationObserver, HistoryObserver, CountdownObserver, MenuObserver } from './Observers';
import { ServiceBroker } from '../Service';
import * as Alarms from './Alarms';
import { TIMER_EXPIRED_NOTIFICATION } from './Notification';

// Register extension event listeners synchronously during service worker startup.
ServiceBroker.instance;

chrome.runtime.onUpdateAvailable.addListener(() => {
  // We must listen to (but do nothing with) the onUpdateAvailable event in order to
  // defer updating the extension until the next time Chrome is restarted. We do not want
  // the extension to automatically reload on update since a Pomodoro might be running.
  // See https://developer.chrome.com/apps/runtime#event-onUpdateAvailable.
});

chrome.action.onClicked.addListener(() => {
  appReady.then(({ timer }) => {
    if (timer.isRunning) {
      timer.pause();
    } else if (timer.isPaused) {
      timer.resume();
    } else {
      timer.start();
    }
  }).catch(error => console.error(error));
});

chrome.contextMenus.onClicked.addListener(info => {
  appReady
    .then(({ menu }) => menu.dispatch(info.menuItemId))
    .catch(error => console.error(error));
});

chrome.alarms.onAlarm.addListener(alarm => {
  return appReady
    .then(app => Alarms.onAlarm(alarm, app))
    .catch(error => console.error(error));
});

function startFromNotification(notificationId) {
  if (notificationId !== TIMER_EXPIRED_NOTIFICATION) {
    return;
  }

  appReady
    .then(({ timer }) => {
      timer.start();
      chrome.notifications.clear(notificationId);
    })
    .catch(error => console.error(error));
}

chrome.notifications.onClicked.addListener(startFromNotification);
chrome.notifications.onButtonClicked.addListener(startFromNotification);

async function run() {
  let settingsManager = new StorageManager(new SettingsSchema(), Chrome.storage.sync);
  let settings = await PersistentSettings.create(settingsManager);
  let timerStore = new TimerStateStore({ settings, storage: Chrome.storage.local });
  let restored = await timerStore.load({ processExpired: false, arm: false });
  let timer = restored.timer;
  let history = new History();

  let menu = createPomodoroMenu(timer);
  timer.observe(new HistoryObserver(history));
  let badgeObserver = new BadgeObserver();
  timer.observe(badgeObserver);
  timer.observe(new NotificationObserver(timer, settings, history));
  timer.observe(new ExpirationSoundObserver(settings));
  timer.observe(new TimerSoundObserver(settings));
  timer.observe(new CountdownObserver(settings));
  timer.observe(new MenuObserver(menu));
  timer.observe({
    onStart: () => timerStore.save(timer),
    onStop: () => timerStore.save(timer),
    onPause: () => timerStore.save(timer),
    onResume: () => timerStore.save(timer),
    onExpire: () => timerStore.save(timer)
  });
  timer.observe({
    onStart: () => Alarms.setTimerAlarm(timer).catch(error => console.error(error)),
    onStop: () => Alarms.setTimerAlarm(timer).catch(error => console.error(error)),
    onPause: () => Alarms.setTimerAlarm(timer).catch(error => console.error(error)),
    onResume: () => Alarms.setTimerAlarm(timer).catch(error => console.error(error)),
    onExpire: () => Alarms.setTimerAlarm(timer).catch(error => console.error(error))
  });

  menu.apply();
  settingsManager.on('change', () => {
    menu.apply();
    timerStore.save(timer);
  });

  if (restored.expired) {
    await timer.expire();
    await timerStore.save(timer);
  } else {
    timer.arm();
    if (timer.isRunning) {
      badgeObserver.onStart(timer.status);
    } else if (timer.isPaused) {
      badgeObserver.onPause(timer.status);
    }
  }
  if (timer.isRunning && timer.phase === Phase.Focus && settings.focus.timerSound) {
    // Rehydrate focus timer sound after service worker/offscreen recovery.
    new TimerSoundObserver(settings).onStart({ phase: timer.phase });
  }

  await Alarms.install(timer, settingsManager);

  ServiceBroker.register(new HistoryService(history));
  ServiceBroker.register(new SoundsService());
  ServiceBroker.register(new SettingsService(settingsManager));
  ServiceBroker.register(new PomodoroService(timer));
  ServiceBroker.register(new OptionsService());

  return { timer, menu, settingsManager };
}

const appReady = run();
ServiceBroker.setReady(appReady);
