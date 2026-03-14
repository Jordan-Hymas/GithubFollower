const DEBUG = process.env.DEBUG === '1';

function timestamp(): string {
  return new Date().toTimeString().slice(0, 8);
}

export const log = {
  info(msg: string) {
    console.log(`[INFO] [${timestamp()}] ${msg}`);
  },
  warn(msg: string) {
    console.warn(`[WARN] [${timestamp()}] ${msg}`);
  },
  error(msg: string) {
    console.error(`[ERROR] [${timestamp()}] ${msg}`);
  },
  debug(msg: string) {
    if (DEBUG) console.log(`[DEBUG] [${timestamp()}] ${msg}`);
  },
};

export type Logger = typeof log;
