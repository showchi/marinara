import { assert } from 'chai';
import { Phase, PomodoroTimer, TimerState } from '@/background/Timer';
import { TIMER_EXPIRE_ALARM, onAlarm } from '@/background/Alarms';

describe('Timer alarms', () => {
  beforeEach(() => {
    global.chrome = {
      i18n: {
        getMessage: key => key
      },
      runtime: {
        lastError: null
      },
      alarms: {
        clear: (name, callback) => callback(true),
        create: () => {}
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
});
