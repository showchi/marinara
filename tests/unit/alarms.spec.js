import { assert } from 'chai';
import { Phase, PomodoroTimer, TimerState } from '@/background/Timer';
import { BADGE_UPDATE_ALARM, TIMER_EXPIRE_ALARM, onAlarm, setTimerAlarm } from '@/background/Alarms';

describe('Timer alarms', () => {
  let createdAlarms;
  let clearedAlarms;

  beforeEach(() => {
    createdAlarms = [];
    clearedAlarms = [];
    global.chrome = {
      i18n: {
        getMessage: key => key
      },
      runtime: {
        lastError: null
      },
      alarms: {
        clear: (name, callback) => {
          clearedAlarms.push(name);
          callback(true);
        },
        create: (name, alarmInfo) => {
          createdAlarms.push({ name, alarmInfo });
        }
      }
    };
  });

  it('expires the timer when the scheduled expire alarm fires even if remaining time is below one minute', async () => {
    const startAt = Date.UTC(2026, 0, 1, 12, 0, 0);
    const expiresAt = startAt + (25 * 60 * 1000);
    let now = startAt;
    let settings = {
      focus: { duration: 25 },
      shortBreak: { duration: 5 },
      longBreak: { duration: 15, interval: 4 }
    };
    let timer = new PomodoroTimer(settings, Phase.Focus, undefined, () => now);

    timer.start();
    now = expiresAt - (20 * 1000);

    await onAlarm({ name: TIMER_EXPIRE_ALARM, scheduledTime: expiresAt }, { timer });

    assert.equal(timer.state, TimerState.Stopped);
    assert.equal(timer.pomodoros, 1);
  });

  it('schedules a recurring badge update alarm while the timer is running', async () => {
    const startAt = Date.UTC(2026, 0, 1, 12, 0, 0);
    let settings = {
      focus: { duration: 25 },
      shortBreak: { duration: 5 },
      longBreak: { duration: 15, interval: 4 }
    };
    let timer = new PomodoroTimer(settings, Phase.Focus, undefined, () => startAt);

    try {
      timer.start();
      await setTimerAlarm(timer);

      assert.include(clearedAlarms, TIMER_EXPIRE_ALARM);
      assert.include(clearedAlarms, BADGE_UPDATE_ALARM);
      assert.deepInclude(createdAlarms, {
        name: TIMER_EXPIRE_ALARM,
        alarmInfo: { when: startAt + (25 * 60 * 1000) }
      });
      assert.deepInclude(createdAlarms, {
        name: BADGE_UPDATE_ALARM,
        alarmInfo: { periodInMinutes: 1 }
      });
    } finally {
      timer.dispose();
    }
  });

  it('clears the badge update alarm when the timer is not running', async () => {
    let settings = {
      focus: { duration: 25 },
      shortBreak: { duration: 5 },
      longBreak: { duration: 15, interval: 4 }
    };
    let timer = new PomodoroTimer(settings, Phase.Focus);

    await setTimerAlarm(timer);

    assert.include(clearedAlarms, TIMER_EXPIRE_ALARM);
    assert.include(clearedAlarms, BADGE_UPDATE_ALARM);
    assert.isEmpty(createdAlarms);
  });

  it('emits a timer tick when the badge update alarm fires', async () => {
    const startAt = Date.UTC(2026, 0, 1, 12, 0, 0);
    let now = startAt;
    let settings = {
      focus: { duration: 25 },
      shortBreak: { duration: 5 },
      longBreak: { duration: 15, interval: 4 }
    };
    let timer = new PomodoroTimer(settings, Phase.Focus, undefined, () => now);
    let ticks = [];
    timer.observe({
      onTick: status => ticks.push(status)
    });

    try {
      timer.start();
      now = startAt + (2 * 60 * 1000);

      await onAlarm({ name: BADGE_UPDATE_ALARM }, { timer });

      assert.lengthOf(ticks, 1);
      assert.closeTo(ticks[0].remaining, 23 * 60, 1);
    } finally {
      timer.dispose();
    }
  });
});
