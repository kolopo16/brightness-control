export function parseDisplays(text) {
    return text.split(/(?=^Display\s+\d+)/m).flatMap((block) => {
        if (!/^Display\s+\d+/m.test(block)) return [];
        const bus = block.match(/I2C bus:\s*\/dev\/i2c-(\d+)/);
        const name = block.match(/Monitor:\s*(.+)/);
        return bus ? [{bus: bus[1], name: name?.[1].trim() ?? `Monitor ${bus[1]}`}] : [];
    });
}

export function parseBrightness(text) {
    const match = text.match(/^VCP 10 C (\d+) (\d+)\s*$/m);
    if (!match || Number(match[2]) <= 0) throw new Error('Monitor did not report brightness');
    return {current: Number(match[1]), max: Number(match[2])};
}
