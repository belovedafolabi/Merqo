import type { ReportResult } from '@/lib/reports/types'

/**
 * A download filename that is still identifiable a week later in a Downloads
 * folder: `sales-summary-2026-08-24.csv` rather than `export.csv` or a uuid.
 *
 * Sanitised rather than trusted, because a report title can come from a saved
 * custom report whose name a user typed. A title containing a quote, a
 * newline, or a path separator would otherwise end up inside a
 * `Content-Disposition` header, where a newline is a header-injection vector
 * and a slash confuses the browser about the path.
 */
export function reportFilename(result: ReportResult, extension: string): string {
  const slug = result.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

  const date = result.generatedAt.slice(0, 10)

  return `${slug || 'report'}-${date}.${extension}`
}
