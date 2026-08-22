import { afterEach, describe, expect, it, vi } from 'vitest'

import { logger } from '@/lib/logger'

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits a single structured JSON record for info', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    logger.info('health.check', { route: '/api/health' })

    expect(spy).toHaveBeenCalledTimes(1)
    const record = JSON.parse(String(spy.mock.calls[0]?.[0]))
    expect(record).toMatchObject({
      level: 'info',
      message: 'health.check',
      context: { route: '/api/health' },
    })
    expect(typeof record.timestamp).toBe('string')
  })

  it('redacts secret-looking context keys but keeps the rest', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logger.error('supabase.request_failed', {
      serviceRoleKey: 'this-must-never-be-logged',
      route: '/api/health',
    })

    const record = JSON.parse(String(spy.mock.calls[0]?.[0]))
    expect(record.context.serviceRoleKey).toBe('[redacted]')
    expect(record.context.route).toBe('/api/health')
  })

  it('routes each level to its matching console method', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    logger.debug('test.debug')
    logger.warn('test.warn')

    expect(debugSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})
