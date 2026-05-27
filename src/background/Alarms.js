import Chrome from '../Chrome';
import Mutex from '../Mutex';
import M from '../Messages';

const AUTOSTART_ALARM = 'autostart';
const TIMER_EXPIRE_ALARM = 'timer-expire';

let mutex = new Mutex();

async function install(timer, settingsManager) {
  let settings = await settingsManager.get();
  settingsManager.on('change', newSettings => {
    setAutostartAlarm(newSettings).catch(error => console.error(error));
  });
  await setAutostartAlarm(settings);
  await setTimerAlarm(timer);
}

async function setAutostartAlarm(settings) {
  await mutex.exclusive(async () => {
    await Chrome.alarms.clear(AUTOSTART_ALARM);

    let time = settings.autostart && settings.autostart.time;
    if (!time) {
      return;
    }

    const now = new Date();

    let startAt = new Date();
    startAt.setHours(...time.split(':'), 0, 0);
    if (startAt <= now) {
      // The trigger is in the past. Set it for tomorrow instead.
      startAt.setDate(startAt.getDate() + 1);
    }

    Chrome.alarms.create(AUTOSTART_ALARM, { when: +startAt });
  });
}

async function setTimerAlarm(timer) {
  await Chrome.alarms.clear(TIMER_EXPIRE_ALARM);

  let { expiresAt } = timer.status;
  if (!timer.isRunning || !expiresAt) {
    return;
  }

  Chrome.alarms.create(TIMER_EXPIRE_ALARM, { when: expiresAt });
}

async function onAlarm(alarm, { timer, settingsManager }) {
  if (alarm.name === AUTOSTART_ALARM) {
    await onAutostartAlarm(timer, settingsManager);
  } else if (alarm.name === TIMER_EXPIRE_ALARM) {
    await onTimerExpireAlarm(alarm, timer);
  }
}

async function onAutostartAlarm(timer, settingsManager) {
  // Set next autostart alarm.
  await setAutostartAlarm(await settingsManager.get());

  if (!timer.isStopped) {
    return;
  }

  // Start a new cycle.
  timer.startCycle();

  Chrome.notifications.create({
    type: 'basic',
    title: M.autostart_notification_title,
    message: M.autostart_notification_message,
    iconUrl: 'images/128.png',
    isClickable: false,
    requireInteraction: true
  });
}

async function onTimerExpireAlarm(alarm, timer) {
  if (!timer.isRunning) {
    return;
  }

  if (alarm.scheduledTime >= timer.status.expiresAt) {
    timer.expire();
    return;
  }

  if (timer.remaining > 0) {
    await setTimerAlarm(timer);
    return;
  }

  timer.expire();
}

export {
  AUTOSTART_ALARM,
  TIMER_EXPIRE_ALARM,
  install,
  setTimerAlarm,
  onAlarm
};
