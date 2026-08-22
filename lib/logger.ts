/**
 * Structured logging convention for Merqo.
 *
 * Every log call emits one JSON line, routed to the console method matching
 * its severity so Vercel's log viewer can filter by level. `message` is a
 * dotted event name (e.g. "sale.created"), not a sentence — grep-able and
 * stable across refactors.
 *
 * No external log aggregator is used (cost constraint) — Vercel's free log
 * retention plus this structured shape is the whole observability story for
 * now. See Milestone 16 for whether that needs to change before launch.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type LogContext = Record<string, unknown>

const SECRET_KEY_PATTERN = /(key|token|secret|password|authorization|cookie|apikey)/i
const REDACTED = '[redacted]'

function redact(context: LogContext): LogContext {
  const safe: LogContext = {}
  for (const [key, value] of Object.entries(context)) {
    safe[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : value
  }
  return safe
}

function emit(level: LogLevel, message: string, context?: LogContext) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context ? { context: redact(context) } : {}),
  }

  const line = JSON.stringify(record)

  switch (level) {
    case 'debug':
      console.debug(line)
      break
    case 'info':
      console.log(line)
      break
    case 'warn':
      console.warn(line)
      break
    case 'error':
      console.error(line)
      break
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),
}
