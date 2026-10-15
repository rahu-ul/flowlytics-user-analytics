/**
 * The "Generate sample activity" script: what the scripted visitor does in the sample store, in order.
 * Selectors refer to markup in backend/public/demo/*.html; backend/test/demo.test.js checks that every
 * target exists there, so the script and the store cannot drift apart silently.
 */
export const SAMPLE_STEPS = [
  { id: 'filter-footwear', label: 'Filter products by Footwear', target: '[data-filter="footwear"]' },
  { id: 'view-details', label: 'Open the Aero Runner details', target: '.product[data-id="aero-runner"] [data-view]' },
  { id: 'add-from-details', label: 'Add it to the cart', target: '#dialog-add' },
  { id: 'close-details', label: 'Close the details', target: '#dialog-close' },
  { id: 'show-all', label: 'Show all products again', target: '[data-filter="all"]' },
  { id: 'add-daypack', label: 'Add the Daypack to the cart', target: '.product[data-id="daypack"] [data-add]' },
  { id: 'claim-code', label: 'Join the sample mailing list', target: '#cta-button' },
  { id: 'open-pricing', label: 'Open the Pricing page', target: '.site-nav a[href="/demo/pricing.html"]', reveal: '#menu-toggle', navigates: true },
  { id: 'choose-plan', label: 'Choose the Growth plan', target: '[data-plan="growth"]' },
  { id: 'back-to-store', label: 'Return to the store', target: '.brand', navigates: true },
];
