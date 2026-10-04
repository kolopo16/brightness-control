import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

export function addShortcutPage(window, settings) {
    const page = new Adw.PreferencesPage({
        title: 'Monitor Brightness',
        icon_name: 'display-brightness-symbolic',
    });
    const native = new Adw.SwitchRow({
        title: 'Use keyboard brightness keys',
        subtitle: 'Control external monitors with the brightness −/+ keys.',
        active: settings.get_boolean('use-brightness-keys'),
    });
    native.connect('notify::active', () =>
        settings.set_boolean('use-brightness-keys', native.active),
    );
    const group = new Adw.PreferencesGroup({
        title: 'Keyboard shortcuts',
        description:
            'Shortcuts adjust all detected monitors. Click a button, then press your shortcut. Escape cancels; Backspace clears.',
    });
    group.add(native);
    for (const [key, title] of [
        ['brightness-up', 'Increase brightness'],
        ['brightness-down', 'Decrease brightness'],
    ]) {
        const row = new Adw.ActionRow({title});
        const button = new Gtk.Button({valign: Gtk.Align.CENTER});
        let captured = false;
        const update = () => {
            const accel = settings.get_strv(key)[0];
            if (accel) {
                const [, keyval, mods] = Gtk.accelerator_parse(accel);
                button.label = Gtk.accelerator_get_label(keyval, mods);
            } else button.label = 'Set extra shortcut…';
            const brightnessKey = key === 'brightness-up' ? 'Brightness +' : 'Brightness −';
            row.subtitle = captured
                ? `Captured: ${brightnessKey} — enabled`
                : native.active
                  ? `${brightnessKey} key enabled`
                  : 'Keyboard brightness key disabled';
        };
        update();
        native.connect('notify::active', () => {
            captured = false;
            update();
        });
        button.connect('clicked', () => {
            const dialog = new Gtk.Window({
                title: title,
                transient_for: window,
                modal: true,
                default_width: 420,
                default_height: 160,
            });
            const label = new Gtk.Label({
                label: `Press the shortcut to ${title.toLowerCase()}`,
                wrap: true,
                margin_start: 24,
                margin_end: 24,
                margin_top: 24,
                margin_bottom: 24,
            });
            dialog.set_child(label);
            const controller = new Gtk.EventControllerKey();
            controller.connect('key-pressed', (_controller, keyval, _keycode, state) => {
                if (keyval === Gdk.KEY_Escape) {
                    dialog.close();
                    return true;
                }
                if (keyval === Gdk.KEY_BackSpace) {
                    settings.set_strv(key, []);
                    update();
                    dialog.close();
                    return true;
                }
                if (
                    [
                        Gdk.KEY_Shift_L,
                        Gdk.KEY_Shift_R,
                        Gdk.KEY_Control_L,
                        Gdk.KEY_Control_R,
                        Gdk.KEY_Alt_L,
                        Gdk.KEY_Alt_R,
                        Gdk.KEY_Super_L,
                        Gdk.KEY_Super_R,
                        Gdk.KEY_Meta_L,
                        Gdk.KEY_Meta_R,
                        Gdk.KEY_Caps_Lock,
                    ].includes(keyval)
                )
                    return true;
                const mods = state & Gtk.accelerator_get_default_mod_mask();
                if ([Gdk.KEY_MonBrightnessUp, Gdk.KEY_MonBrightnessDown].includes(keyval)) {
                    const expected =
                        key === 'brightness-up'
                            ? Gdk.KEY_MonBrightnessUp
                            : Gdk.KEY_MonBrightnessDown;
                    if (keyval !== expected) {
                        label.label = 'Press the brightness key for this direction.';
                        return true;
                    }
                    native.active = true;
                    captured = true;
                    settings.set_strv(key, []);
                    update();
                    window.add_toast(new Adw.Toast({title: `${title} key captured and enabled`}));
                    dialog.close();
                    return true;
                }
                const accel = Gtk.accelerator_name(Gdk.keyval_to_lower(keyval), mods);
                if (!Gtk.accelerator_valid(keyval, mods)) {
                    label.label =
                        'Choose a shortcut with Ctrl, Alt or Super, or a function/media key.';
                    return true;
                }
                const other = key === 'brightness-up' ? 'brightness-down' : 'brightness-up';
                if (settings.get_strv(other).includes(accel)) {
                    label.label = 'That shortcut is already assigned to the other direction.';
                    return true;
                }
                captured = false;
                settings.set_strv(key, [accel]);
                window.add_toast(new Adw.Toast({title: `${title} shortcut saved`}));
                update();
                dialog.close();
                return true;
            });
            dialog.add_controller(controller);
            dialog.present();
            // Wayland normally routes brightness keys straight to GNOME.
            // Inhibit those shortcuts only while this focused capture dialog is open.
            dialog.get_surface()?.inhibit_system_shortcuts(null);
            dialog.connect('close-request', () => {
                dialog.get_surface()?.restore_system_shortcuts();
                return false;
            });
        });
        row.add_suffix(button);
        row.activatable_widget = button;
        group.add(row);
    }
    const step = new Adw.SpinRow({
        title: 'Brightness step (%)',
        adjustment: new Gtk.Adjustment({
            lower: 1,
            upper: 25,
            step_increment: 1,
            page_increment: 5,
            value: settings.get_int('step'),
        }),
    });
    step.connect('notify::value', () => settings.set_int('step', step.value));
    group.add(step);
    page.add(group);
    window.add(page);
}
