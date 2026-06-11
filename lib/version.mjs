export const VERSION = '0.10.0';

export const COWORK_SCOPED_REVIEW = {
  status: 'passed_scoped',
  score: 9.8,
  scope: 'Revolv v0.4.0 next-six consolidation',
  commit: 'f86e479',
  deployment: 'dpl_B7oKyo4QQWQQoBJvn3GnrAat8vMD',
  return_artifact: 'plans/reviews/revolv-v040-cowork-review-RETURN-2026-06-10.md',
  boundary: 'Not a broad production-grade, partner-ready, live-DUAL, payment, or full-SaaS score'
};

export function broadCoworkReview() {
  const score = Number(process.env.REVOLV_BROAD_COWORK_SCORE || 0);
  const status = process.env.REVOLV_BROAD_COWORK_STATUS || 'pending';
  const reviewedVersion = process.env.REVOLV_BROAD_COWORK_VERSION || '';
  const reviewedCommit = process.env.REVOLV_BROAD_COWORK_COMMIT || '';
  const currentCommit = currentBuildCommit();
  const claimScope = process.env.REVOLV_BROAD_COWORK_CLAIM || 'partner_ready_pilot';
  const versionMatches = !reviewedVersion || reviewedVersion === VERSION;
  const commitMatches = !reviewedCommit || !currentCommit || reviewedCommit === currentCommit;
  const passed = status === 'passed' && score >= 9.8 && versionMatches && commitMatches;
  return {
    status,
    passed,
    score: Number.isFinite(score) ? score : 0,
    scope: process.env.REVOLV_BROAD_COWORK_SCOPE || 'Revolv v0.10.0 broad production/partner-ready review',
    claim_scope: claimScope,
    reviewed_version: reviewedVersion || null,
    reviewed_commit: reviewedCommit || null,
    current_version: VERSION,
    current_commit: currentCommit,
    version_matches: versionMatches,
    commit_matches: commitMatches,
    return_artifact: process.env.REVOLV_BROAD_COWORK_RETURN_ARTIFACT || null,
    boundary: passed
      ? 'Allows only the claim scope recorded here; live DUAL writes, payment capture, and excluded provider actions remain separate gates.'
      : 'Broad production/partner-ready claim remains blocked until external Claude Cowork returns >=9.8 for the exact deployed version and commit.'
  };
}

export function publicUrls() {
  const vercelRoot = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
  return {
    canonical: process.env.REVOLV_PUBLIC_URL || (vercelRoot ? `${vercelRoot}/revolv` : 'https://offermesh.vercel.app/revolv'),
    compatibility_root: process.env.OFFERMESH_PUBLIC_URL || vercelRoot || 'https://offermesh.vercel.app',
    protected_alias: process.env.REVOLV_PROTECTED_ALIAS_URL || 'https://revolv-offers.vercel.app'
  };
}

export function currentBuildCommit() {
  return process.env.REVOLV_BUILD_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || null;
}
