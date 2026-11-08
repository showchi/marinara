import { assert } from 'chai';
import { SingletonPage, PageHost } from '@/background/SingletonPage';
import { ExpirationPage } from '@/background/Expiration';

describe('Extension page discovery with tabs permission', () => {
  let originalChrome;
  let tabs;
  let createdTabs;
  let createdWindows;
  let updatedTabs;
  let removedTabs;

  const url = 'chrome-extension://test/modules/countdown.html';

  beforeEach(() => {
    originalChrome = global.chrome;
    tabs = [];
    createdTabs = [];
    createdWindows = [];
    updatedTabs = [];
    removedTabs = [];
    global.chrome = {
      runtime: {
        lastError: null,
        getURL: path => `chrome-extension://test/${path}`,
        // Unloaded/discarded tabs have no active document context.
        getContexts: async () => []
      },
      tabs: {
        query: (query, callback) => {
          if (query.active) {
            assert.deepEqual(query, { active: true, windowId: 1 });
            callback([{ id: 3, index: 2, windowId: 1 }]);
          } else {
            assert.deepEqual(query, {});
            callback(tabs);
          }
        },
        create: (options, callback) => {
          createdTabs.push(options);
          callback({ id: 8, ...options });
        },
        update: (id, options, callback) => {
          updatedTabs.push({ id, options });
          callback({ id, windowId: 1 });
        },
        remove: (id, callback) => {
          removedTabs.push(id);
          callback();
        },
        onRemoved: { addListener: () => {}, removeListener: () => {} }
      },
      windows: {
        getLastFocused: (options, callback) => callback({ id: 1 }),
        create: (options, callback) => {
          createdWindows.push(options);
          callback({ tabs: [{ id: 9 }] });
        },
        update: () => {}
      }
    };
  });

  afterEach(() => {
    global.chrome = originalChrome;
  });

  it('reuses a matching page and updates its hash while preserving canonical URL matching', async () => {
    tabs.push({ id: 7, url: `${url}/?b=2&a=1#old` });

    let page = await SingletonPage.show(`${url}?a=1&b=2#new`, PageHost.Tab);

    assert.equal(page.tabId, 7);
    assert.deepEqual(updatedTabs, [{ id: 7, options: { url: `${url}?a=1&b=2#new` } }]);
    assert.isEmpty(createdTabs);
    assert.isEmpty(createdWindows);
  });

  it('discovers only own extension tabs when other tab URLs are hidden or exposed', async () => {
    let ownTab = { id: 7, url, discarded: true };
    tabs.push(ownTab, { id: 4 }, { id: 5, url: 'https://example.com/modules/countdown.html' },
      { id: 6, url: 'chrome-extension://other/modules/countdown.html' });

    assert.deepEqual(await SingletonPage.getOpenPages(), [ownTab]);
  });

  it('creates a tab with the original placement and properties when no own page exists', async () => {
    tabs.push({ id: 4 }, { id: 5, url: 'chrome-extension://other/modules/countdown.html' });

    let page = await SingletonPage.show(url, PageHost.Tab, { pinned: true });

    assert.equal(page.tabId, 8);
    assert.deepEqual(createdTabs, [{
      url, active: false, pinned: true, windowId: 1, openerTabId: 3, index: 3
    }]);
  });

  for (let path of ['options', 'countdown']) {
    it(`reuses a discarded ${path} page without an active document`, async () => {
      let pageUrl = chrome.runtime.getURL(`modules/${path}.html`);
      tabs.push({ id: 7, url: pageUrl, discarded: true });

      let page = await SingletonPage.show(pageUrl, PageHost.Tab);

      assert.equal(page.tabId, 7);
      assert.isEmpty(createdTabs);
      assert.isEmpty(createdWindows);
    });
  }

  it('creates a countdown popup and reuses its unloaded tab after worker state is lost', async () => {
    let first = await SingletonPage.show(url, PageHost.Window, { width: 300, height: 200 });
    tabs.push({ id: first.tabId, url, discarded: true });

    let second = await SingletonPage.show(url, PageHost.Window);

    assert.equal(second.tabId, first.tabId);
    assert.deepEqual(createdWindows, [{ url, type: 'popup', width: 300, height: 200 }]);
    assert.isEmpty(createdTabs);
  });

  it('closes loaded and discarded expiration tabs without in-memory page state', async () => {
    let expireUrl = chrome.runtime.getURL('modules/expire.html');
    tabs.push(
      { id: 7, url: expireUrl }, { id: 8, url: expireUrl, discarded: true },
      { id: 9, url }, { id: 10 }, { id: 11, url: 'chrome-extension://other/modules/expire.html' }
    );

    await ExpirationPage.closeOpenPages();

    assert.deepEqual(removedTabs, [7, 8]);
  });
});
