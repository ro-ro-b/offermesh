// Seed data — two demo brands/programs, four offers, three mandates (good, narrow, sponsored-opt-out).
import { createBrand, createProgram, createOffer } from '../lib/offers.mjs';
import { createMandate } from '../lib/mandates.mjs';

export function seed(store) {
  const aurora = createBrand(store, { name: 'Aurora Audio', ref: 'brand:aurora-audio' });
  const verde = createBrand(store, { name: 'Verde Outdoor', ref: 'brand:verde-outdoor' });

  const program = createProgram(store, {
    brandRef: aurora.id,
    name: 'Aurora Audio — Agent Launch Offers',
    rewardUnit: 'loyalty_credit',
    budgetEscrow: 500,
    policy: { perAgentRedemptionCap: 2, perEpochRedemptionCap: 50, categories: ['electronics', 'audio'] }
  });

  const program2 = createProgram(store, {
    brandRef: verde.id,
    name: 'Verde Outdoor — Verified Outcome Pilot',
    rewardUnit: 'cashback_token',
    budgetEscrow: 300,
    policy: { perAgentRedemptionCap: 1, perEpochRedemptionCap: 25, categories: ['outdoor'] }
  });

  const offers = [
    createOffer(store, program.id, {
      title: '15% off Aurora ANC headphones for mandated agents',
      category: 'audio', merchant: aurora.id,
      price: 200, incentiveValue: 30, incentiveType: 'discount',
      terms: '15% (30 units) off qualifying ANC headphone purchase completed by a mandated agent'
    }),
    createOffer(store, program.id, {
      title: 'Cashback token on Aurora soundbar',
      category: 'audio', merchant: aurora.id,
      price: 350, incentiveValue: 25, incentiveType: 'cashback_token',
      terms: '25-unit cashback token on verified soundbar redemption'
    }),
    createOffer(store, program.id, {
      title: 'Expiring bundle credit (already past expiry — for lifecycle demo)',
      category: 'audio', merchant: aurora.id,
      price: 120, incentiveValue: 10, incentiveType: 'credit',
      expiresAt: '2026-01-01T00:00:00.000Z',
      terms: '10-unit credit on bundle purchase'
    }),
    createOffer(store, program2.id, {
      title: 'Verde trail pack — verified redemption credit',
      category: 'outdoor', merchant: verde.id,
      price: 180, incentiveValue: 36, incentiveType: 'cashback_token',
      terms: '20% (36 units) cashback token on verified trail pack redemption'
    })
  ];

  const goodMandate = createMandate(store, {
    principalRef: 'principal:ian-demo',
    agentId: 'agent:claude-reference',
    scope: ['quote', 'redeem_offer', 'purchase'],
    spendCeiling: 1000,
    merchantAllowlist: [aurora.id, verde.id],
    expiresAt: '2027-01-01T00:00:00.000Z'
  });

  const narrowMandate = createMandate(store, {
    principalRef: 'principal:ian-demo',
    agentId: 'agent:narrow-scope',
    scope: ['quote'], // missing redeem_offer — gate must block
    spendCeiling: 50,
    merchantAllowlist: ['brand:someone-else'],
    expiresAt: '2027-01-01T00:00:00.000Z'
  });

  const noSponsoredMandate = createMandate(store, {
    principalRef: 'principal:privacy-first',
    agentId: 'agent:unsponsored',
    scope: ['quote', 'redeem_offer', 'purchase'],
    spendCeiling: 1000,
    merchantAllowlist: [],
    allowSponsored: false, // principal opts out of paid influence entirely
    expiresAt: '2027-01-01T00:00:00.000Z'
  });

  return { brands: [aurora, verde], program, program2, offers, goodMandate, narrowMandate, noSponsoredMandate };
}
