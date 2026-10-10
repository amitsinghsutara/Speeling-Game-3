/** A problem found while importing or validating content. Rows are 1-based spreadsheet rows. */
export interface ContentIssue {
  severity: 'error' | 'warning'
  sheet: string
  row?: number
  field?: string
  message: string
}

export const hasErrors = (issues: readonly ContentIssue[]): boolean =>
  issues.some((issue) => issue.severity === 'error')

export const formatIssue = (issue: ContentIssue): string => {
  const where = [issue.sheet, issue.row !== undefined ? `row ${issue.row}` : null, issue.field]
    .filter(Boolean)
    .join(' / ')
  return `[${issue.severity}] ${where}: ${issue.message}`
}
