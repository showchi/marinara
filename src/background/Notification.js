import Chrome from '../Chrome';

const TIMER_EXPIRED_NOTIFICATION = 'timer-expired';

class Notification
{
  constructor(title, message) {
    this.title = title;
    this.message = message;
    this.buttons = [];
  }

  addButton(title) {
    this.buttons.push({ title });
  }

  async show() {
    let options = {
      type: 'basic',
      title: this.title,
      message: this.message,
      iconUrl: chrome.runtime.getURL('images/128.png'),
      isClickable: true,
      requireInteraction: true,
      buttons: this.buttons.map(b => {
        return {
          title: b.title,
          iconUrl: chrome.runtime.getURL('images/start.png')
        };
      })
    };

    try {
      await Chrome.notifications.create(TIMER_EXPIRED_NOTIFICATION, options);
    } catch (error) {
      let fallbackOptions = {
        ...options,
        buttons: this.buttons.map(b => ({ title: b.title }))
      };
      await Chrome.notifications.create(TIMER_EXPIRED_NOTIFICATION, fallbackOptions);
    }
  }

  close() {
    chrome.notifications.clear(TIMER_EXPIRED_NOTIFICATION);
  }
}

export {
  TIMER_EXPIRED_NOTIFICATION
};

export default Notification;
