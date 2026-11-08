# Marinara: Pomodoro® Assistant

Marinara is a [time management assistant for Chrome](https://chrome.google.com/webstore/detail/marinara/lojgmehidjdhhbmpjfamhpkpodfcodef) that follows the [Pomodoro Technique](https://en.wikipedia.org/wiki/Pomodoro_Technique).

Pomodoro® and The Pomodoro Technique® are trademarks of Francesco Cirillo. Marinara is not affiliated or associated with or endorsed by Pomodoro®, The Pomodoro Technique® or Francesco Cirillo.

## Features

- Short & long breaks
- Toolbar icon with countdown timer
- Track Pomodoro history & stats
- Configurable long break intervals
- Configurable timer durations
- Desktop & tab notifications
- Audio notifications with over 20 sounds
- Ticking timer sounds
- Scheduled automatic timers
- Open source software

## Screenshots

![](assets/screenshots/focus.png)
![](assets/screenshots/stats-1.png)
![](assets/screenshots/stats-2.png)
![](assets/screenshots/settings.png)
![](assets/screenshots/menu.png)
![](assets/screenshots/notification.png)
![](assets/screenshots/break.png)

## Developer Setup

The build is verified with Node.js 24.16.0 and npm 11.13.0 on macOS arm64.
From a clean checkout, run:

    npm ci
    npm run test:unit
    npm run build

Load the `package` directory using **Load unpacked** in Chrome's extensions page
(Developer mode enabled). Chrome 116 or later is required. For a watch build,
run `npm run dev`.

The `tabs` permission is retained to find existing extension pages, including
discarded or restored tabs, on all supported Chrome versions. Removing this
permission is a separate change that requires revisiting page reuse and stale
reminder cleanup.

The npm scripts enable `--openssl-legacy-provider` for their own processes when
using OpenSSL 3, including the test runner. This is a temporary compatibility
workaround for webpack 4; no global `NODE_OPTIONS` setting is required. Styles
are compiled with Dart Sass, without the native `node-sass` dependency.

An active or paused timer survives service worker restarts within the current
browser session. Fully restarting the browser, reloading or updating the
extension resets the timer; settings and completed Pomodoro history are retained.

Currently, Marinara is configured for developers working and packaging releases on Mac OS. Support for Linux or Windows is welcome.

Marinara uses the system `ruby` and `make` tools to build releases.

It also uses [jq](https://stedolan.github.io/jq/) to manipulate the `manifest.json`. You can quickly install it using [Homebrew](https://brew.sh/):

    brew install jq

Once installed you can package a release by running:

    make release

This will produce a packaged extension ready for uploading to the Chrome Web Store in the root directory of the project.

## License

Pomodoro® and The Pomodoro Technique® are trademarks of Francesco Cirillo. Marinara is not affiliated or associated with or endorsed by Pomodoro®, The Pomodoro Technique® or Francesco Cirillo.

Copyright &copy; 2015 Chris Schmich  \
MIT License. See [LICENSE](LICENSE) for details.
