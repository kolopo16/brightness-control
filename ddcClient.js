import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const COMMAND_TIMEOUT_SECONDS = 20;

/** Owns asynchronous ddcutil processes for one extension activation. */
export class DdcClient {
    constructor() {
        this._processes = new Set();
    }

    async run(args) {
        const process = Gio.Subprocess.new(
            ['ddcutil', ...args],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        );
        const processes = this._processes;
        processes.add(process);
        const timeout = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            COMMAND_TIMEOUT_SECONDS,
            () => {
                process.force_exit();
                return GLib.SOURCE_REMOVE;
            },
        );
        try {
            return await new Promise((resolve, reject) => {
                process.communicate_utf8_async(null, null, (source, result) => {
                    try {
                        const [, stdout, stderr] = source.communicate_utf8_finish(result);
                        if (!source.get_successful())
                            throw new Error(stderr.trim() || 'DDC command failed or timed out');
                        resolve(stdout);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        } finally {
            // A timeout removes its own source; only remove it if still present.
            if (GLib.MainContext.default().find_source_by_id(timeout)) GLib.Source.remove(timeout);
            processes.delete(process);
        }
    }

    destroy() {
        for (const process of this._processes) process.force_exit();
    }
}
