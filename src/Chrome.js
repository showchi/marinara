class ChromeError extends Error
{
  constructor(...params) {
    super(...params);
  }
}

class Chrome
{
  static get tabs() {
    return Tabs;
  }

  static get windows() {
    return Windows;
  }

  static get notifications() {
    return Notifications;
  }

  static get storage() {
    return Storage;
  }

  static get files() {
    return Files;
  }

  static get alarms() {
    return Alarms;
  }

  static get runtime() {
    return Runtime;
  }

  static get contextMenus() {
    return ContextMenus;
  }
}

function promise(fn) {
  return new Promise((resolve, reject) => {
    const callback = (...results) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new ChromeError(err.message));
      } else {
        resolve(...results);
      }
    };

    fn(callback);
  });
}

class Tabs
{
  static async create(options) {
    // Create tab in specific window.
    const createInWindow = async windowId => {
      // Get the currently active tab in this window and make it the 'opener'
      // of the tab we're creating. When our tab is closed, the opener tab will
      // be reactivated.
      let tabs = await Chrome.tabs.query({ active: true, windowId });
      let openerTab = (tabs && tabs.length > 0) ? tabs[0] : {};
      let openerTabId = openerTab.id || null;
      let index = openerTab.index + 1 || 0;

      let tabOptions = { ...options, windowId, openerTabId, index };
      return promise(callback => {
        chrome.tabs.create(tabOptions, callback);
      });
    };

    try {
      let targetWindow = await Chrome.windows.getLastFocused({ windowTypes: ['normal'] });
      if (targetWindow) {
        return createInWindow(targetWindow.id);
      }
    } catch (e) {
      if (e instanceof ChromeError) {
        // We assume there was no last focused window, ignore.
        console.error(e);
      } else {
        throw e;
      }
    }

    // No active window for our tab, so we must create our own.
    let windowOptions = { focused: !!options.active };
    let newWindow = await Chrome.windows.create(windowOptions);
    return createInWindow(newWindow.id);
  }

  static async getCurrent() {
    return promise(callback => {
      chrome.tabs.getCurrent(callback);
    });
  }

  static async update(tabId, updateProperties) {
    return promise(callback => {
      chrome.tabs.update(tabId, updateProperties, callback);
    });
  }

  static async query(queryInfo) {
    return promise(callback => {
      chrome.tabs.query(queryInfo, callback);
    });
  }

  static async remove(tabId) {
    return promise(callback => {
      chrome.tabs.remove(tabId, callback);
    });
  }
}

class Windows
{
  static async getAll(getInfo) {
    return promise(callback => {
      chrome.windows.getAll(getInfo, callback);
    });
  }

  static async getLastFocused(getInfo) {
    return promise(callback => {
      chrome.windows.getLastFocused(getInfo, callback);
    });
  }

  static async create(createData) {
    return promise(callback => {
      chrome.windows.create(createData, callback);
    });
  }

  static async update(windowId, updateInfo) {
    return promise(callback => {
      chrome.windows.update(windowId, updateInfo, callback);
    });
  }
}

class Notifications
{
  static async create(...args) {
    return promise(callback => {
      let notificationId = '';
      let options = null;
      if (args.length === 1) {
        options = args[0];
      } else {
        [notificationId, options] = args;
      }

      try {
        chrome.notifications.create(notificationId, options, callback);
      } catch (e) {
        // This is failing on Firefox as it doesn't support the buttons option for the notification and raises an exception when this is called. (see http://bugzil.la/1190681)
        // Try again with a subset of options that are more broadly supported
        const compatibleOptions = {
          type: options.type,
          iconUrl: options.iconUrl,
          title: options.title,
          message: options.message
        };
        chrome.notifications.create(notificationId, compatibleOptions, callback);
      }
    });
  }
}

class Storage
{
  constructor(store) {
    this.store = store;
  }

  get(keys = null) {
    return promise(callback => {
      this.store.get(keys, callback);
    });
  }

  set(obj) {
    return promise(callback => {
      this.store.set(obj, callback);
    });
  }

  clear() {
    return promise(callback => {
      this.store.clear(callback);
    });
  }

  static get sync() {
    if (!this._sync) {
      this._sync = new Storage(chrome.storage.sync);
    }
    return this._sync;
  }

  static get local() {
    if (!this._local) {
      this._local = new Storage(chrome.storage.local);
    }
    return this._local;
  }
}

class Files
{
  static async readFile(file) {
    let url = chrome.runtime.getURL(file);
    let response = await fetch(url);
    return await response.text();
  }

  static async readBinary(file) {
    let url = chrome.runtime.getURL(file);
    let response = await fetch(url);
    return await response.arrayBuffer();
  }
}

class Alarms
{
  static create(name, alarmInfo) {
    return chrome.alarms.create(name, alarmInfo);
  }

  static async clear(name) {
    return promise(callback => {
      chrome.alarms.clear(name, callback);
    });
  }

  static async clearAll() {
    return promise(callback => {
      chrome.alarms.clearAll(callback)
    });
  }
}

class Runtime
{
  static getPlatformInfo() {
    return promise(callback => {
      chrome.runtime.getPlatformInfo(callback)
    });
  }
}

class ContextMenus
{
  static async create(createProperties) {
    return new Promise((resolve, reject) => {
      let id = chrome.contextMenus.create(createProperties, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new ChromeError(err.message));
        } else {
          resolve(id);
        }
      });
    });
  }

  static async removeAll() {
    return promise(callback => {
      chrome.contextMenus.removeAll(callback);
    });
  }
}

export default Chrome;
