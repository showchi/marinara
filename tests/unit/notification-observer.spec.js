import { assert } from 'chai';

let NotificationObserver;
let Phase;
let PomodoroTimer;

describe('NotificationObserver', () => {
  let notifications;
  let tabs;
  let notificationErrors;
  let consoleError;

  const settings = {
    focus: {
      duration: 25,
      notifications: {
        desktop: true,
        tab: true
      }
    },
    shortBreak: {
      duration: 5,
      notifications: {
        desktop: true,
        tab: true
      }
    },
    longBreak: {
      duration: 15,
      interval: null,
      notifications: {
        desktop: true,
        tab: true
      }
    }
  };

  beforeEach(() => {
    notifications = [];
    tabs = [];
    notificationErrors = [];
    consoleError = console.error;
    console.error = () => {};
    global.chrome = {
      i18n: {
        getMessage: key => key
      },
      runtime: {
        lastError: null,
        getURL: path => `chrome-extension://test/${path}`,
        onMessage: {
          addListener: () => {}
        }
      },
      notifications: {
        create: (notificationId, options, callback) => {
          notifications.push({ notificationId, options });
          chrome.runtime.lastError = notificationErrors.shift() || null;
          callback(notificationId);
          chrome.runtime.lastError = null;
        }
      },
      tabs: {
        query: (queryInfo, callback) => callback([]),
        create: (options, callback) => {
          let tab = { id: tabs.length + 1, windowId: 1, ...options };
          tabs.push(tab);
          callback(tab);
        },
        onRemoved: {
          addListener: () => {},
          removeListener: () => {}
        }
      },
      windows: {
        getLastFocused: (getInfo, callback) => callback({ id: 1 }),
        update: () => {}
      }
    };

    ({ NotificationObserver } = require('@/background/Observers'));
    ({ Phase, PomodoroTimer } = require('@/background/Timer'));
  });

  afterEach(() => {
    console.error = consoleError;
  });

  it('creates desktop and tab notifications when an enabled timer expires', async () => {
    let timer = new PomodoroTimer(settings, Phase.Focus);
    let history = {
      countToday: async () => 1
    };
    timer.observe(new NotificationObserver(timer, settings, history));

    timer.start();
    await timer.expire();

    assert.lengthOf(notifications, 1);
    assert.equal(notifications[0].notificationId, 'timer-expired');
    assert.equal(notifications[0].options.iconUrl, 'chrome-extension://test/images/128.png');
    assert.equal(notifications[0].options.buttons[0].iconUrl, 'chrome-extension://test/images/start.png');
    assert.lengthOf(tabs, 1);
    assert.equal(tabs[0].url, 'chrome-extension://test/modules/expire.html');
  });

  it('retries desktop notifications without button icons when Chrome cannot load an image', async () => {
    notificationErrors.push({ message: 'Unable to download all specified images.' });
    let timer = new PomodoroTimer(settings, Phase.Focus);
    let history = {
      countToday: async () => 1
    };
    timer.observe(new NotificationObserver(timer, settings, history));

    timer.start();
    await timer.expire();

    assert.lengthOf(notifications, 2);
    assert.equal(notifications[1].notificationId, 'timer-expired');
    assert.deepEqual(notifications[1].options.buttons, [{ title: 'start_break_now' }]);
    assert.lengthOf(tabs, 1);
  });

  it('opens the tab notification even when the desktop notification fails', async () => {
    notificationErrors.push(
      { message: 'Unable to download all specified images.' },
      { message: 'Unable to download all specified images.' }
    );
    let timer = new PomodoroTimer(settings, Phase.Focus);
    let history = {
      countToday: async () => 1
    };
    timer.observe(new NotificationObserver(timer, settings, history));

    timer.start();
    await timer.expire();

    assert.lengthOf(notifications, 2);
    assert.lengthOf(tabs, 1);
    assert.equal(tabs[0].url, 'chrome-extension://test/modules/expire.html');
  });
});
