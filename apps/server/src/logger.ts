import { pino } from "pino";

export type Logger = ReturnType<typeof pino>;

export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
  });
}
