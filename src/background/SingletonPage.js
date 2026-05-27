import Chrome from '../Chrome';
import Enum from './Enum';

const PageHost = new Enum({
  Tab: 0,
  Window: 1
});

function canonical(url) {
  // The canonical page URL is the combined origin, path, and sorted query,
  // lowercased, excluding hashes and trailing slashes.
  // This will only reliably work with internal extension pages.
  url.searchParams.sort();
  return `${url.origin}${url.pathname.replace(/\/$/, '')}${url.searchParams}`.toLowerCase();
}

class SingletonPage
{
  static async show(url, host, properties = {}) {
    // Search existing extension pages to see if page is already open.
    let targetUrl = new URL(url);
    let targetCanonical = canonical(targetUrl);

    let tabs = await Chrome.tabs.query({});
    for (let tab of tabs) {
      if (!tab.url || canonical(new URL(tab.url)) !== targetCanonical) {
        continue;
      }

      // We found a matching page. Update its URL to keep the hash in sync.
      if (tab.url !== url) {
        await Chrome.tabs.update(tab.id, { url });
      }
      return new SingletonPage(tab.id);
    }

    // Page does not exist, so create it.
    if (host === PageHost.Tab) {
      let tab = await Chrome.tabs.create({ url, active: false, ...properties });
      return new SingletonPage(tab.id);
    } else if (host === PageHost.Window) {
      let createdWindow = await Chrome.windows.create({ url, type: 'popup', ...properties });
      return new SingletonPage(createdWindow.tabs[0].id);
    } else {
      throw new Error('Invalid page host.');
    }
  }

  constructor(tabId) {
    this.tabId = tabId;

    const self = this;
    chrome.tabs.onRemoved.addListener(function removed(id) {
      if (id === self.tabId) {
        chrome.tabs.onRemoved.removeListener(removed);
        self.tabId = null;
      }
    });
  }

  focus() {
    if (!this.tabId) {
      return;
    }

    const focusWindow = tab => chrome.windows.update(tab.windowId, { focused: true });
    const focusTab = id => {
      try {
        chrome.tabs.update(id, { active: true, highlighted: true }, focusWindow);
      } catch (e) {
        // Firefox doesn't currently allow setting highlighted for chrome.tabs.update()
        // TODO: File a FF bug for this
        chrome.tabs.update(id, { active: true }, focusWindow);
      }
    };

    focusTab(this.tabId);
  }

  close() {
    if (!this.tabId) {
      return;
    }

    chrome.tabs.remove(this.tabId, () => {});
  }
}

export {
  PageHost,
  SingletonPage
};
