export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

function write(level: string, message: string, data?: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(data ? { data } : {}),
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export const logger: Logger = {
  info(message, data) {
    write("info", message, data);
  },
  warn(message, data) {
    write("warn", message, data);
  },
  error(message, data) {
    write("error", message, data);
  },
};

