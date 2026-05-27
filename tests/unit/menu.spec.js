import { assert } from 'chai';

function loadMenuDispatchApi() {
  let module = require('@/background/Menu');
  let api = {
    MENU_IDS: module.MENU_IDS,
    createPomodoroMenuItems: module.createPomodoroMenuItems,
    dispatchPomodoroMenuCommand: module.dispatchPomodoroMenuCommand
  };

  assert.isObject(api.MENU_IDS, 'Menu.js should export stable MENU_IDS for MV3 context menu dispatch');
  assert.isFunction(api.createPomodoroMenuItems, 'Menu.js should export createPomodoroMenuItems descriptors without inline callbacks');
  assert.isFunction(api.dispatchPomodoroMenuCommand, 'Menu.js should export dispatchPomodoroMenuCommand for id-based menu handling');
  return api;
}

function flattenMenuItems(items) {
  return items.reduce((flattened, item) => {
    flattened.push(item);
    if (item.children) {
      flattened.push(...flattenMenuItems(item.children));
    }
    return flattened;
  }, []);
}

describe('Pomodoro menu dispatch', () => {
  it('defines stable command ids for every pomodoro menu action', () => {
    let { MENU_IDS } = loadMenuDispatchApi();

    assert.deepEqual(MENU_IDS, {
      startFocus: 'startFocus',
      startShortBreak: 'startShortBreak',
      startLongBreak: 'startLongBreak',
      pause: 'pause',
      resume: 'resume',
      stop: 'stop',
      startCycle: 'startCycle',
      showHistoryPage: 'showHistoryPage'
    });
  });

  it('dispatches each command id to the expected timer or options action', async () => {
    let { MENU_IDS, dispatchPomodoroMenuCommand } = loadMenuDispatchApi();
    let calls = [];
    let timer = {
      startFocus: () => calls.push('startFocus'),
      startShortBreak: () => calls.push('startShortBreak'),
      startLongBreak: () => calls.push('startLongBreak'),
      pause: () => calls.push('pause'),
      resume: () => calls.push('resume'),
      stop: () => calls.push('stop'),
      startCycle: () => calls.push('startCycle')
    };
    let optionsClient = {
      showHistoryPage: async () => calls.push('showHistoryPage')
    };

    for (let id of Object.values(MENU_IDS)) {
      await dispatchPomodoroMenuCommand(id, { timer, optionsClient });
    }

    assert.deepEqual(calls, [
      'startFocus',
      'startShortBreak',
      'startLongBreak',
      'pause',
      'resume',
      'stop',
      'startCycle',
      'showHistoryPage'
    ]);
  });

  it('describes menu items with command ids instead of inline callback closures', () => {
    let { MENU_IDS, createPomodoroMenuItems } = loadMenuDispatchApi();
    let timer = {
      hasLongBreak: true,
      isRunning: true,
      isPaused: false
    };

    let items = flattenMenuItems(createPomodoroMenuItems(timer));

    assert.includeMembers(items.map(item => item.id), Object.values(MENU_IDS));
    for (let item of items) {
      assert.notProperty(item, 'onclick');
      assert.notProperty(item, 'run');
      if (item.id) {
        assert.include(Object.values(MENU_IDS), item.id);
      }
    }
  });
});
