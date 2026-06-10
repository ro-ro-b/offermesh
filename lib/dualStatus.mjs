// Truthful DUAL posture endpoint — fleet standard. No live writes, no credentials, mapping pending.
export function dualStatus() {
  return {
    service: 'revolv',
    product: 'revolv',
    engine: 'offermesh',
    version: '0.4.0',
    targetNetwork: 'mainnet',
    org: '6a1a927534603174374c8ecf', // Dual Labs (intended home; no binding created)
    mainnetMappingPending: true,
    templateId: null,
    objectId: null,
    readbackReady: false,
    writeMode: 'read_only',
    publicWrites: false,
    liveDualWrites: false,
    operatorGateConfigured: false,
    credentialStored: false,
    disclosure: {
      sponsored_offers_machine_readable: true,
      pii_in_public_state: false,
      rewards: 'simulated_only_pending_legal_review'
    }
  };
}
