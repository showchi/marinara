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
      iconUrl: 'images/128.png',
      isClickable: true,
      requireInteraction: true,
      buttons: this.buttons.map(b => {
        return {
          title: b.title,
          iconUrl: 'images/start.png'
        };
      })
    };

    await Chrome.notifications.create(TIMER_EXPIRED_NOTIFICATION, options);
  }

  close() {
    chrome.notifications.clear(TIMER_EXPIRED_NOTIFICATION);
  }
}

export {
  TIMER_EXPIRED_NOTIFICATION
};

export default Notification;
