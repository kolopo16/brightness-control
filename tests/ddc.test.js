import {parseDisplays, parseBrightness} from '../ddc.js';
function assert(condition, message) {
    if (!condition) throw new Error(message);
}
const displays = parseDisplays(
    `Device warning\nDisplay 1\n I2C bus: /dev/i2c-8\n Monitor: TST:Example Display A:0001\n\nInvalid display\n I2C bus: /dev/i2c-9\n\nDisplay 2\n I2C bus: /dev/i2c-12\n Monitor: TST:Example Display B:0002\n`,
);
assert(
    displays.length === 2 && displays[0].bus === '8' && displays[1].bus === '12',
    'Parse valid displays only',
);
assert(parseDisplays('No displays found.').length === 0, 'Handle no monitors');
assert(parseBrightness('VCP 10 C 65 100\n').current === 65, 'Read current brightness');
assert(parseBrightness('VCP 10 C 120 255').max === 255, 'Support non-100 maximum');
for (const text of ['VCP 10 ERR', 'VCP 10 C 0 0', 'garbage']) {
    let threw = false;
    try {
        parseBrightness(text);
    } catch {
        threw = true;
    }
    assert(threw, `Reject invalid response: ${text}`);
}
print('DDC parser tests passed');
