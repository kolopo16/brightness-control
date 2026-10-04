import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {QuickSlider} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {parseDisplays, parseBrightness} from './ddc.js';
import {DdcClient} from './ddcClient.js';

const WRITE_DELAY_MS = 120;
const SHORTCUTS = [
    ['brightness-up', 1],
    ['brightness-down', -1],
];

export default class BrightnessControl extends Extension {
    enable() {
        this._active = true;
        this._generation = (this._generation ?? 0) + 1;
        this._refreshing = false;
        this._ddc = new DdcClient();
        this._monitors = [];
        this._settings = this.getSettings();
        this._icon = new Gio.ThemedIcon({name: 'display-brightness-symbolic'});
        this._createControl();
        this._bindShortcuts();
        this._monitorSignal = Main.layoutManager.connect('monitors-changed', () => this._refresh());
        this._refresh();
    }

    _createControl() {
        this._control = new QuickSlider({
            iconName: 'display-brightness-symbolic',
            iconLabel: 'Monitor Brightness',
            menuEnabled: true,
            menuButtonAccessibleName: 'Monitor brightness settings',
        });
        this._control.slider.accessible_name = 'Monitor Brightness';
        this._label = new St.Label({text: '…', y_align: Clutter.ActorAlign.CENTER});
        const box = this._control.get_child();
        box.insert_child_at_index(this._label, box.get_n_children() - 1);
        const quickSettings = Main.panel.statusArea.quickSettings;
        const volume = quickSettings._volumeOutput?.quickSettingsItems.at(-1);
        quickSettings.menu.insertItemBefore(
            this._control,
            volume?.get_next_sibling() ?? quickSettings.menu.getFirstItem(),
            2,
        );
        this._control.slider.connect('notify::value', () => {
            if (this._syncingControl || this._refreshing) return;
            const value = this._control.slider.value;
            for (const monitor of this._monitors) this._set(monitor, value);
        });
        this._control.slider.connect('scroll-event', (_slider, event) => {
            if (this._refreshing) return Clutter.EVENT_STOP;
            const delta = this._scrollDelta(event);
            for (const monitor of this._monitors) this._set(monitor, monitor.value + delta);
            return Clutter.EVENT_STOP;
        });
    }

    _bindShortcuts() {
        for (const [key, direction] of SHORTCUTS) {
            Main.wm.addKeybinding(
                key,
                this._settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                () => this._adjust(direction),
            );
        }
        this._nativeSettings = new Gio.Settings({schema_id: 'org.gnome.shell.keybindings'});
        this._nativeChanged = this._settings.connect('changed::use-brightness-keys', () =>
            this._setNativeKeys(this._settings.get_boolean('use-brightness-keys')),
        );
        this._setNativeKeys(this._settings.get_boolean('use-brightness-keys'));
    }

    _setNativeKeys(enabled) {
        for (const [key, direction, method] of [
            ['screen-brightness-up', 1, '_screenBrightnessUp'],
            ['screen-brightness-down', -1, '_screenBrightnessDown'],
        ]) {
            Main.wm.removeKeybinding(key);
            Main.wm.addKeybinding(
                key,
                this._nativeSettings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.ALL,
                enabled
                    ? () => this._adjust(direction)
                    : Main.brightnessManager[method].bind(Main.brightnessManager),
            );
        }
    }

    _scrollDelta(event) {
        if (event.get_flags() & Clutter.EventFlags.FLAG_POINTER_EMULATED) return 0;
        const direction = event.get_scroll_direction();
        let steps = 0;
        if (direction === Clutter.ScrollDirection.UP) steps = 1;
        else if (direction === Clutter.ScrollDirection.DOWN) steps = -1;
        else if (direction === Clutter.ScrollDirection.SMOOTH) {
            const [dx, dy] = event.get_scroll_delta();
            steps = Math.abs(dy) >= Math.abs(dx) ? -dy : dx;
        }
        return (steps * this._settings.get_int('step')) / 100;
    }

    _footer(message = null) {
        this._control.menu.setHeader('display-brightness-symbolic', 'Monitor Brightness');
        if (message)
            this._control.menu.addMenuItem(new PopupMenu.PopupMenuItem(message, {reactive: false}));
        this._control.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._control.menu.addAction('Refresh monitors', () => this._refresh());
        this._control.menu.addAction('Keyboard shortcuts…', () => this.openPreferences());
    }

    async _refresh() {
        if (!this._active || this._refreshing || this._monitors.some((m) => m.writing || m.timer))
            return;
        const generation = this._generation;
        const ddc = this._ddc;
        this._refreshing = true;
        this._control.menu.removeAll();
        this._monitors = [];
        this._label.text = '…';
        this._control.slider.reactive = false;
        this._control.slider.can_focus = false;
        this._footer('Detecting monitors…');
        try {
            if (!GLib.find_program_in_path('ddcutil'))
                throw new Error('Install ddcutil, then refresh monitors');
            const displays = parseDisplays(await ddc.run(['detect', '--brief']));
            const failures = [];
            for (const display of displays) {
                if (!this._active || generation !== this._generation) return;
                try {
                    const value = parseBrightness(
                        await ddc.run(['--bus', display.bus, 'getvcp', '10', '--terse']),
                    );
                    if (!this._active || generation !== this._generation) return;
                    display.max = value.max;
                    display.value = value.current / value.max;
                    display.confirmed = display.value;
                    this._monitors.push(display);
                } catch (error) {
                    failures.push(`${display.name}: ${error.message}`);
                }
            }
            if (!this._active || generation !== this._generation) return;
            this._control.menu.removeAll();
            for (const monitor of this._monitors) this._addMonitor(monitor);
            this._footer(
                this._monitors.length ? null : 'No DDC/CI monitors. Check DDC/CI and I²C access.',
            );
            if (failures.length)
                this._control.menu.addMenuItem(
                    new PopupMenu.PopupMenuItem('Some monitors could not be read', {
                        reactive: false,
                    }),
                );
            this._syncControls();
        } catch (error) {
            if (!this._active || generation !== this._generation) return;
            this._control.menu.removeAll();
            this._footer(error.message);
            this._syncControls();
        } finally {
            if (generation === this._generation) this._refreshing = false;
        }
    }

    _addMonitor(monitor) {
        monitor.title = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._control.menu.addMenuItem(monitor.title);
        const item = new PopupMenu.PopupBaseMenuItem({activate: false});
        monitor.slider = new Slider(monitor.value);
        monitor.slider.x_expand = true;
        item.add_child(monitor.slider);
        this._control.menu.addMenuItem(item);
        monitor.slider.accessible_name = `${monitor.name} brightness`;
        monitor.slider.connect('scroll-event', (_slider, event) => {
            this._set(monitor, monitor.value + this._scrollDelta(event));
            return Clutter.EVENT_STOP;
        });
        monitor.slider.connect('notify::value', () => {
            if (!monitor.syncing) this._set(monitor, monitor.slider.value);
        });
    }

    _syncControls() {
        for (const monitor of this._monitors)
            monitor.title.label.text = `${monitor.name}  ${Math.round(monitor.value * 100)}%`;
        this._syncingControl = true;
        this._control.slider.value = this._monitors.length
            ? this._monitors.reduce((sum, m) => sum + m.value, 0) / this._monitors.length
            : 0;
        this._control.slider.reactive = this._monitors.length > 0;
        this._control.slider.can_focus = this._monitors.length > 0;
        this._syncingControl = false;
        const values = this._monitors.map((m) => Math.round(m.value * 100));
        if (values.length === 0) this._label.text = '—';
        else if (values.every((value) => value === values[0])) this._label.text = `${values[0]}%`;
        else this._label.text = `${Math.min(...values)}–${Math.max(...values)}%`;
    }

    _set(monitor, value) {
        const target = Math.max(0, Math.min(1, value));
        if (target === monitor.value) return;
        monitor.value = target;
        monitor.syncing = true;
        monitor.slider.value = monitor.value;
        monitor.syncing = false;
        this._syncControls();
        monitor.pending = true;
        if (monitor.timer) GLib.Source.remove(monitor.timer);
        monitor.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, WRITE_DELAY_MS, () => {
            monitor.timer = 0;
            this._write(monitor);
            return GLib.SOURCE_REMOVE;
        });
    }

    async _write(monitor) {
        if (monitor.writing || !this._active) return;
        const generation = this._generation;
        const ddc = this._ddc;
        monitor.writing = true;
        try {
            while (monitor.pending && this._active && generation === this._generation) {
                monitor.pending = false;
                const value = monitor.value;
                await ddc.run([
                    '--bus',
                    monitor.bus,
                    'setvcp',
                    '10',
                    String(Math.round(value * monitor.max)),
                ]);
                monitor.confirmed = value;
            }
        } catch (error) {
            if (this._active && generation === this._generation) {
                monitor.pending = false;
                monitor.value = monitor.confirmed;
                monitor.syncing = true;
                monitor.slider.value = monitor.value;
                monitor.syncing = false;
                this._syncControls();
                Main.notify('Monitor Brightness', `${monitor.name}: ${error.message}`);
            }
        } finally {
            monitor.writing = false;
        }
    }

    _adjust(direction) {
        if (this._refreshing) return;
        if (!this._monitors.length) {
            Main.notify(
                'Monitor Brightness',
                'No monitors available. Open the brightness menu and refresh.',
            );
            return;
        }
        for (const monitor of this._monitors)
            this._set(monitor, monitor.value + (direction * this._settings.get_int('step')) / 100);
        const average = this._monitors.reduce((sum, m) => sum + m.value, 0) / this._monitors.length;
        Main.osdWindowManager.showAll(this._icon, 'Monitor Brightness', average, 1);
    }

    disable() {
        this._active = false;
        this._generation++;
        Main.layoutManager.disconnect(this._monitorSignal);
        this._settings.disconnect(this._nativeChanged);
        this._setNativeKeys(false);
        this._nativeSettings = null;
        for (const key of ['brightness-up', 'brightness-down']) Main.wm.removeKeybinding(key);
        for (const monitor of this._monitors) if (monitor.timer) GLib.Source.remove(monitor.timer);
        this._ddc.destroy();
        this._control.destroy();
        this._settings = null;
    }
}
