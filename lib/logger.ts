/**
 * Structured logging convention for Merqo.
 *
 * Every log call emits one JSON line, routed to the console method matching
 * its severity so Vercel's log viewer can filter by level. `message` is a
 * dotted event name (e.g. "sale.created"), not a sentence — grep-able and
 * stable across refactors.
 *
 * No external log aggregator is used (cost constraint) — Vercel's free log
 * retention plus this structured shape is the whole observability story.
 * Milestone 16 reviewed this and confirmed it: at MVP client scale, these
 * JSON lines + Vercel runtime logs + the audit_logs table cover the
 * diagnosable failure modes, and an error-tracking service (even a free
 * tier) would mean one DSN to provision and rotate per independently
 * deployed client. Revisit past ~5 clients, or the first incident that
 * genuinely cannot be diagnosed from logs. See
 * docs/milestones/16-launch/operations.md.
 *
 * The dotted event-name convention is enforced by
 * tests/unit/logging-conventions.test.ts, which re-derives every logger call
 * site from source rather than trusting this comment.
 *
 * Known, deliberately un-deepened: redact() below inspects only top-level
 * context keys. A secret nested inside an object value would pass through.
 * No current call site does this; noted rather than fixed.
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
