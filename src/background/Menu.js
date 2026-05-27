import M from '../Messages';
import Chrome from '../Chrome';
import { OptionsClient } from './Services';

const MENU_IDS = {
  startFocus: 'startFocus',
  startShortBreak: 'startShortBreak',
  startLongBreak: 'startLongBreak',
  pause: 'pause',
  resume: 'resume',
  stop: 'stop',
  startCycle: 'startCycle',
  showHistoryPage: 'showHistoryPage'
};

async function dispatchPomodoroMenuCommand(id, { timer, optionsClient = OptionsClient.once }) {
  let commands = {
    [MENU_IDS.startFocus]: () => timer.startFocus(),
    [MENU_IDS.startShortBreak]: () => timer.startShortBreak(),
    [MENU_IDS.startLongBreak]: () => timer.startLongBreak(),
    [MENU_IDS.pause]: () => timer.pause(),
    [MENU_IDS.resume]: () => timer.resume(),
    [MENU_IDS.stop]: () => timer.stop(),
    [MENU_IDS.startCycle]: () => timer.startCycle(),
    [MENU_IDS.showHistoryPage]: () => optionsClient.showHistoryPage()
  };

  let command = commands[id];
  if (!command) {
    return;
  }

  return await command();
}

class Menu
{
  constructor(contexts, ...groups) {
    this.contexts = contexts;
    this.groups = groups;
  }

  addGroup(group) {
    this.groups.push(group);
  }

  async apply() {
    await Chrome.contextMenus.removeAll();

    let firstGroup = true;
    for (let group of this.groups) {
      let firstItem = true;
      for (let item of group.items) {
        if (!item.visible) {
          continue;
        }

        if (firstItem && !firstGroup) {
          await Chrome.contextMenus.create({ type: 'separator', contexts: this.contexts });
        }

        firstGroup = false;
        firstItem = false;

        if (item instanceof ParentMenu) {
          let id = await Chrome.contextMenus.create({
            title: item.title,
            contexts: this.contexts
          });

          for (let child of item.children) {
            if (!child.visible) {
              continue;
            }

            await Chrome.contextMenus.create({
              id: child.id,
              title: child.title,
              contexts: this.contexts,
              parentId: id
            });
          }
        } else {
          await Chrome.contextMenus.create({
            id: item.id,
            title: item.title,
            contexts: this.contexts
          });
        }
      }
    }
  }
}

class MenuGroup
{
  constructor(...items) {
    this.items = items;
  }

  addItem(item) {
    this.items.push(item);
  }
}

class ParentMenu
{
  constructor(...children) {
    this.children = children;
  }

  addChild(child) {
    this.children.push(child);
  }

  get title() {
    return '';
  }

  get visible() {
    return false;
  }
}

class RestartTimerParentMenu extends ParentMenu
{
  constructor(...children) {
    super(...children);
  }

  get title() {
    return M.restart_timer;
  }

  get visible() {
    return true;
  }
}

class Action
{
  get id() {
    return '';
  }

  get title() {
    return '';
  }

  get visible() {
    return false;
  }

  run() {
  }
}

class StartFocusingAction extends Action
{
  constructor(timer) {
    super();
    this.timer = timer;
  }

  get id() {
    return MENU_IDS.startFocus;
  }

  get title() {
    return M.start_focusing;
  }

  get visible() {
    return true;
  }

  run() {
    this.timer.startFocus();
  }
}

class StartShortBreakAction extends Action
{
  constructor(timer) {
    super();
    this.timer = timer;
  }

  get id() {
    return MENU_IDS.startShortBreak;
  }

  get title() {
    return this.timer.hasLongBreak ? M.start_short_break : M.start_break;
  }

  get visible() {
    return true;
  }

  run() {
    this.timer.startShortBreak();
  }
}

class StartLongBreakAction extends Action
{
  constructor(timer) {
    super();
    this.timer = timer;
  }

  get id() {
    return MENU_IDS.startLongBreak;
  }

  get title() {
    return M.start_long_break;
  }

  get visible() {
    return this.timer.hasLongBreak;
  }

  run() {
    this.timer.startLongBreak();
  }
}

class StopTimerAction extends Action
{
  constructor(timer) {
    super();
    this.timer = timer;
  }

  get id() {
    return MENU_IDS.stop;
  }

  get title() {
    return M.stop_timer;
  }

  get visible() {
    return this.timer.isRunning || this.timer.isPaused;
  }

  run() {
    this.timer.stop();
  }
}

class PauseTimerAction extends Action
{
  constructor(timer) {
    super();
    this.timer = timer;
  }

  get id() {
    return MENU_IDS.pause;
  }

  get title() {
    return M.pause_timer;
  }

  get visible() {
    return this.timer.isRunning;
  }

  run() {
    this.timer.pause();
  }
}

class ResumeTimerAction extends Action
{
  constructor(timer) {
    super();
    this.timer = timer;
  }

  get id() {
    return MENU_IDS.resume;
  }

  get title() {
    return M.resume_timer;
  }

  get visible() {
    return this.timer.isPaused;
  }

  run() {
    this.timer.resume();
  }
}

class PomodoroHistoryAction extends Action
{
  constructor() {
    super();
  }

  get id() {
    return MENU_IDS.showHistoryPage;
  }

  get title() {
    return M.pomodoro_history;
  }

  get visible() {
    return true;
  }

  async run() {
    await OptionsClient.once.showHistoryPage();
  }
}

class StartPomodoroCycleAction extends Action
{
  constructor(timer) {
    super();
    this.timer = timer;
  }

  get id() {
    return MENU_IDS.startCycle;
  }

  get title() {
    if (this.timer.isRunning || this.timer.isPaused) {
      return M.restart_pomodoro_cycle;
    } else {
      return M.start_pomodoro_cycle;
    }
  }

  get visible() {
    return this.timer.hasLongBreak;
  }

  run() {
    this.timer.startCycle();
  }
}

class PomodoroMenuSelector
{
  constructor(timer, inactive, active) {
    this.timer = timer;
    this.inactive = inactive;
    this.active = active;
    this.applyQueue = Promise.resolve();
    this.applyAgain = false;
  }

  apply() {
    if (this.applying) {
      this.applyAgain = true;
      return this.applyQueue;
    }

    this.applying = true;
    this.applyQueue = this.applyQueue
      .then(async () => {
        do {
          this.applyAgain = false;
          let menu = (this.timer.isRunning || this.timer.isPaused) ? this.active : this.inactive;
          await menu.apply();
        } while (this.applyAgain);
      })
      .catch(error => console.error(error))
      .then(() => {
        this.applying = false;
      });

    return this.applyQueue;
  }

  dispatch(id) {
    return dispatchPomodoroMenuCommand(id, { timer: this.timer });
  }
}

function createPomodoroMenuItems(timer) {
  let pause = new PauseTimerAction(timer);
  let resume = new ResumeTimerAction(timer);
  let stop = new StopTimerAction(timer);

  let startCycle = new StartPomodoroCycleAction(timer);
  let startFocus = new StartFocusingAction(timer);
  let startShortBreak = new StartShortBreakAction(timer);
  let startLongBreak = new StartLongBreakAction(timer);
  let viewHistory = new PomodoroHistoryAction();

  let items = timer.isRunning || timer.isPaused ? [
      pause,
      resume,
      stop,
      new RestartTimerParentMenu(
        startFocus,
        startShortBreak,
        startLongBreak
      ),
      startCycle,
      viewHistory
    ] : [
    startCycle,
    startFocus,
    startShortBreak,
    startLongBreak,
    viewHistory
  ];

  const describe = item => {
    let descriptor = {
      title: item.title,
      visible: item.visible
    };

    if (item.id) {
      descriptor.id = item.id;
    }

    if (item instanceof ParentMenu) {
      descriptor.children = item.children
        .filter(child => child.visible)
        .map(describe);
    }

    return descriptor;
  };

  return items.filter(item => item.visible).map(describe);
}

function createPomodoroMenu(timer) {
  let pause = new PauseTimerAction(timer);
  let resume = new ResumeTimerAction(timer);
  let stop = new StopTimerAction(timer);

  let startCycle = new StartPomodoroCycleAction(timer);
  let startFocus = new StartFocusingAction(timer);
  let startShortBreak = new StartShortBreakAction(timer);
  let startLongBreak = new StartLongBreakAction(timer);
  let viewHistory = new PomodoroHistoryAction();

  let inactive = new Menu(['action'],
    new MenuGroup(
      startCycle,
      startFocus,
      startShortBreak,
      startLongBreak
    ),
    new MenuGroup(
      viewHistory
    )
  );

  let active = new Menu(['action'],
    new MenuGroup(
      pause,
      resume,
      stop,
      new RestartTimerParentMenu(
        startFocus,
        startShortBreak,
        startLongBreak
      ),
      startCycle
    ),
    new MenuGroup(
      viewHistory
    )
  );

  return new PomodoroMenuSelector(timer, inactive, active);
}

export {
  MENU_IDS,
  createPomodoroMenuItems,
  dispatchPomodoroMenuCommand,
  createPomodoroMenu
};
