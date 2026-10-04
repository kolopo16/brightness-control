import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {addShortcutPage} from './shortcuts.js';

export default class BrightnessPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        addShortcutPage(window, this.getSettings());
    }
}
