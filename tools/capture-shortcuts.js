import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import {addShortcutPage} from '../shortcuts.js';
const root = Gio.File.new_for_uri(import.meta.url)
    .get_parent()
    .get_parent()
    .get_path();
if (!Gio.File.new_for_path(`${root}/schemas/gschemas.compiled`).query_exists(null)) {
    printerr('Run glib-compile-schemas --strict schemas before opening the shortcut editor.');
    imports.system.exit(1);
}

const source = Gio.SettingsSchemaSource.new_from_directory(
    `${root}/schemas`,
    Gio.SettingsSchemaSource.get_default(),
    false,
);
const settings = new Gio.Settings({
    settings_schema: source.lookup('org.gnome.shell.extensions.brightness-control', false),
});
const app = new Adw.Application({
    application_id: 'org.gnome.Shell.Extensions.BrightnessControl.Setup',
    flags: Gio.ApplicationFlags.NON_UNIQUE,
});
app.connect('activate', () => {
    const window = new Adw.PreferencesWindow({
        application: app,
        title: 'Monitor Brightness — Shortcut Setup',
        default_width: 640,
        default_height: 380,
    });
    addShortcutPage(window, settings);
    window.present();
});
app.run([]);
Gio.Settings.sync();
