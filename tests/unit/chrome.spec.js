import { assert } from 'chai';
import Chrome from '@/Chrome';

describe('Chrome tabs wrapper', () => {
  let originalChrome;

  beforeEach(() => {
    originalChrome = global.chrome;
    global.chrome = {
      runtime: {
        lastError: null
      },
      tabs: {
        remove: (tabId, callback) => {
          callback();
        }
      }
    };
  });

  afterEach(() => {
    global.chrome = originalChrome;
  });

  it('treats removing an already-closed tab as a successful close', async () => {
    chrome.tabs.remove = (tabId, callback) => {
      chrome.runtime.lastError = { message: `No tab with id: ${tabId}.` };
      callback();
      chrome.runtime.lastError = null;
    };

    await Chrome.tabs.remove(1644212462);
  });

  it('rejects non-idempotent tab removal errors', async () => {
    chrome.tabs.remove = (tabId, callback) => {
      chrome.runtime.lastError = { message: 'Tabs cannot be edited right now.' };
      callback();
      chrome.runtime.lastError = null;
    };

    try {
      await Chrome.tabs.remove(1);
      assert.fail('Expected Chrome.tabs.remove to reject.');
    } catch (error) {
      assert.equal(error.message, 'Tabs cannot be edited right now.');
    }
  });
});
