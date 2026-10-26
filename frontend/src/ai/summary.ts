export type Finding = { ruleId: string; code: string; severity: string; files: string[]; evidence: string[] };
export type AuditSummary = { totalFiles: number; totalSize: number; status: string; issues: Finding[]; uncheckedFiles: unknown[]; rules: { ruleId: string; status: string }[] };

export function buildAuditSummary(report: AuditSummary, includeNames: boolean) {
  const grouped = new Map<string, { ruleId: string; code: string; severity: string; count: number; files: string[]; evidence: string[] }>();
  for (const issue of report.issues) {
    const key = `${issue.ruleId}:${issue.code}:${issue.severity}`;
    const finding = grouped.get(key) ?? { ruleId: issue.ruleId, code: issue.code, severity: issue.severity, count: 0, files: [], evidence: [] };
    finding.count++;
    if (includeNames) {
      finding.files.push(...issue.files.slice(0, 3).map(file => file.slice(0, 180)));
      finding.evidence.push(...issue.evidence.filter(value => value.length <= 180 && !/[\\/]/.test(value)).slice(0, 2));
    }
    grouped.set(key, finding);
  }
  return JSON.stringify({
    totalFiles: report.totalFiles,
    totalBytes: report.totalSize,
    status: report.status,
    uncheckedCount: report.uncheckedFiles.length,
    failedRules: report.rules.filter(rule => rule.status === 'error').map(rule => rule.ruleId),
    findings: [...grouped.values()].map(finding => includeNames ? {
      ruleId: finding.ruleId, code: finding.code, severity: finding.severity, issueCount: finding.count,
      files: [...new Set(finding.files)].slice(0, 12), evidence: [...new Set(finding.evidence)].slice(0, 8),
    } : {
      ruleId: finding.ruleId, code: finding.code, severity: finding.severity, issueCount: finding.count,
    }),
  }, null, 2);
}
