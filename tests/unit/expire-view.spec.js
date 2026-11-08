import { assert } from 'chai';
import { shallowMount } from '@vue/test-utils';
import Expire from '@/expire/Expire.vue';
import { ServiceBroker } from '@/Service';

describe('Expiration view statistics', () => {
  let originalChrome;
  let originalInvoke;
  let wrapper;

  beforeEach(() => {
    originalChrome = global.chrome;
    originalInvoke = ServiceBroker.invoke;
    global.chrome = {
      i18n: { getMessage: key => key },
      runtime: { onMessage: { removeListener: () => {} } }
    };
  });

  afterEach(() => {
    if (wrapper) {
      wrapper.destroy();
      wrapper = null;
    }
    ServiceBroker.invoke = originalInvoke;
    global.chrome = originalChrome;
  });

  async function show(pomodoros) {
    ServiceBroker.invoke = async () => ({
      title: 'Take a break', action: 'Start break', messages: [], phase: 'break', pomodoros
    });
    wrapper = shallowMount(Expire, {
      mocks: { M: { completed_today: 'Completed today', view_history: 'View history' } }
    });
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  it('keeps the next-session action while hiding unavailable statistics', async () => {
    await show(null);

    assert.equal(wrapper.find('.start-session').text(), 'Start break');
    assert.isFalse(wrapper.find('.pomodoros-today').exists());
  });

  it('continues to show completed Pomodoro icons when the count is available', async () => {
    await show(2);

    assert.lengthOf(wrapper.findAll('.icon-circle').wrappers, 2);
  });
});
