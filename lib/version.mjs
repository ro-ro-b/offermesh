export const VERSION = '0.5.1';

export const COWORK_SCOPED_REVIEW = {
  status: 'passed_scoped',
  score: 9.8,
  scope: 'Revolv v0.4.0 next-six consolidation',
  commit: 'f86e479',
  deployment: 'dpl_B7oKyo4QQWQQoBJvn3GnrAat8vMD',
  return_artifact: 'plans/reviews/revolv-v040-cowork-review-RETURN-2026-06-10.md',
  boundary: 'Not a broad production-grade, partner-ready, live-DUAL, payment, or full-SaaS score'
};

export function publicUrls() {
  return {
    canonical: process.env.REVOLV_PUBLIC_URL || 'https://offermesh.vercel.app/revolv',
    compatibility_root: process.env.OFFERMESH_PUBLIC_URL || 'https://offermesh.vercel.app',
    protected_alias: process.env.REVOLV_PROTECTED_ALIAS_URL || 'https://revolv-offers.vercel.app'
  };
}
