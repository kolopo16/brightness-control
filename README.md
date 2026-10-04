# Monitor Brightness

Control external monitor brightness from GNOME Quick Settings and your keyboard.

- Brightness slider and percentage directly below audio volume.
- Mouse-wheel and trackpad adjustment, with a configurable step.
- Individual sliders for multiple monitors.
- Support for brightness keys and custom shortcuts.
- GNOME brightness popup when using the keyboard.

Requires **GNOME Shell 50**, `ddcutil`, and a monitor with DDC/CI enabled. Some monitors and docks do not support DDC/CI. This extension changes hardware brightness; it does not apply software dimming.

## Installation

On Fedora, install the dependencies and apply the device access rules:

```sh
sudo dnf install ddcutil gjs python3 glib2
sudo udevadm trigger --subsystem-match=i2c-dev
sudo udevadm settle
ddcutil detect --brief
```

Your monitor should appear in the detection output. Enable DDC/CI in the monitor's own menu if needed.

From this project directory, run:

```sh
./install.sh
```

Log out and back in, then enable the extension:

```sh
gnome-extensions enable brightness-control@extensions.local
```

If replacing an earlier development copy with a different identifier, disable that copy in the Extensions app before enabling this one. Saved brightness shortcuts and step settings are retained.

## Usage

Open Quick Settings and drag or scroll over the brightness slider. The main slider controls all detected monitors; its arrow opens individual monitor sliders and preferences.

Brightness −/+ keys are enabled by default. Scrolling and keyboard adjustments use a 5% step, configurable in preferences:

```sh
gnome-extensions prefs brightness-control@extensions.local
```

To assign an extra shortcut, click its button and press a key combination. Escape cancels; Backspace clears. GNOME may ask to allow system shortcuts through while the capture dialog is open. A confirmation appears when the shortcut is saved. Avoid shortcuts already used by GNOME or other extensions.

The displayed percentage updates immediately and rolls back if a monitor write fails. Different monitor values appear as a range. Choose **Refresh monitors** after changing brightness using a monitor's own buttons.

## Development

The extension uses GJS and GNOME libraries, with no runtime npm dependencies.

| File | Purpose |
| --- | --- |
| `extension.js` | Quick Settings UI, keyboard bindings, monitor state |
| `ddcClient.js` | Asynchronous ddcutil execution and process cleanup |
| `ddc.js` | Parsing monitor detection and brightness responses |
| `shortcuts.js` | Shared preferences UI and shortcut capture |
| `prefs.js` | GNOME preferences entry point |
| `schemas/` | GSettings definitions |
| `tests/` | DDC response parser tests |

Run the checks:

```sh
./tools/check.sh
```

Format JavaScript and JSON with the optional development formatter:

```sh
npx --yes prettier@3.6.2 --write '*.js' 'tools/*.js' 'tests/*.js' '*.json'
```

Open the standalone shortcut editor before the extension is loaded:

```sh
glib-compile-schemas --strict schemas
gjs -m tools/capture-shortcuts.js
```

The installer compiles schemas in a temporary directory. Generated schemas and extension archives are excluded from Git.

After changing extension JavaScript, reinstall and log out and back in. GNOME Shell caches loaded modules, so toggling the extension does not reliably reload code. Preferences changes take effect immediately.

Inspect runtime errors with:

```sh
journalctl --user -b -o cat | rg 'brightness-control|Monitor Brightness'
gnome-extensions info brightness-control@extensions.local
```

The GNOME 50 integration uses private Shell APIs for placement below volume and brightness-key handling. Other GNOME versions require compatibility testing before adding them to `metadata.json`.

## References

- [GNOME extension structure](https://gjs.guide/extensions/overview/anatomy.html)
- [GNOME extension preferences](https://gjs.guide/extensions/development/preferences.html)
- [ddcutil monitor detection](https://www.ddcutil.com/command_detect/)
- [ddcutil brightness response format](https://www.ddcutil.com/command_getvcp/)
