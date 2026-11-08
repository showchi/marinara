import { SingletonPage, PageHost } from './SingletonPage';
import { Service, ServiceBroker } from '../Service';
import Chrome from '../Chrome';

class ExpirationService extends Service
{
  static get serviceName() {
    return 'ExpirationService';
  }

  constructor(properties, page) {
    super();
    this.properties = properties;
    this.page = page;
  }

  async getProperties() {
    // When the expiration page asks for properties, it has loaded,
    // so we can focus it now.
    setTimeout(() => this.page.focus(), 0);
    return this.properties;
  }
}

class ExpirationPage
{
  static async show(title, messages, action, pomodoros, phase) {
    let page = await SingletonPage.show(chrome.runtime.getURL('modules/expire.html'), PageHost.Tab);
    return new ExpirationPage(page, title, messages, action, pomodoros, phase);
  }

  static async closeOpenPages() {
    let url = chrome.runtime.getURL('modules/expire.html');
    let tabs = await SingletonPage.getOpenPages();

    await Promise.all(tabs
      .filter(tab => tab.url === url)
      .map(tab => Chrome.tabs.remove(tab.id)));
  }

  constructor(page, title, messages, action, pomodoros, phase) {
    this.page = page;

    const properties = { title, messages, pomodoros, action, phase };
    this.service = new ExpirationService(properties, page);
    ServiceBroker.register(this.service);

    const self = this;
    chrome.tabs.onRemoved.addListener(function removed(id) {
      if (id !== page.tabId) {
        return;
      }

      // Service no longer needed.
      ServiceBroker.unregister(self.service);
      chrome.tabs.onRemoved.removeListener(removed);
    });
  }

  async close() {
    await this.page.close();
  }
}

const ExpirationClient = ExpirationService.proxy;

export {
  ExpirationPage,
  ExpirationService,
  ExpirationClient
};
