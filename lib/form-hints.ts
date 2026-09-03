/**
 * One-line explanations shown in the <InfoHint> next to a form field's
 * label (components/ui/field-hint.tsx). Grouped by the form the field lives
 * on. Copy only — no logic — so it can be imported by any client form
 * component without pulling anything server-side in.
 *
 * Deliberately excludes the auth screens (sign-in / sign-up / password /
 * invite-accept): those fields need no explaining.
 */
export const FORM_HINTS = {
  product: {
    name: 'The name shown on the POS, receipts and reports. Keep it short and recognisable.',
    sku: 'A short internal code you use to identify this product. Leave blank and one is generated from the name.',
    barcode:
      'The number under the barcode on the packaging. Used to add the product by scanning at the till.',
    category: 'An optional grouping (e.g. Drinks, Snacks) used for filtering and reports.',
    unitOfMeasurement:
      'How this product is counted or sold — piece, pack, carton, kg, litre. Manage the list from the Units button.',
    costPrice:
      'What you pay to buy or make one unit. Used for profit reporting; never shown to customers.',
    basePrice: 'The normal selling price per unit, before any branch override or discount.',
    description: 'Optional notes about the product. Not printed on receipts.',
    openingStock:
      'How many units are in stock right now at your main branch. Recorded as a stock adjustment; you can correct it later on the Inventory screen.',
  },
  variant: {
    name: 'What makes this version different — e.g. "500ml", "Large", "Red".',
    sku: 'Optional code specific to this variant. Leave blank to inherit handling from the parent product.',
    barcode: 'The barcode for this specific variant, if it has its own.',
    costPrice: 'Cost for this variant. Leave blank to use the parent product’s cost price.',
    basePrice: 'Selling price for this variant. Leave blank to use the parent product’s price.',
  },
  unit: {
    name: 'The full name of the unit, e.g. "Half carton".',
    abbreviation: 'A short form shown in tight spaces, e.g. "½ctn".',
  },
  branchPriceOverride: {
    branch: 'The branch this special price applies to. Other branches keep the base price.',
    price: 'The selling price at this branch, replacing the product’s base price.',
  },
  checkout: {
    paymentMethod: 'How the customer is paying. Store credit needs a customer attached.',
    customer:
      'Attach a customer to record the sale against them, enable store credit, and track history.',
    discountPercentage:
      'A percentage taken off the subtotal. May need a manager’s approval above a set limit.',
    discountReason: 'Why the discount is being given — kept on the sale record for auditing.',
    paymentReference:
      'An optional note such as a transfer reference or card authorisation code, printed on the receipt.',
  },
  returns: {
    reason: 'Why the item is coming back — recorded on the return and visible in reports.',
    quantity: 'How many of this line to return. Cannot exceed what was originally sold.',
    refundMethod: 'How the customer is refunded — cash, card, transfer, or store credit.',
  },
  layawayPayment: {
    amount: 'How much the customer is paying toward the layaway balance now.',
    method: 'How this instalment is being paid.',
    reference: 'An optional transfer or card reference for this payment.',
  },
  receiptSettings: {
    template:
      'The overall layout. Compact suits 58mm rolls; Detailed adds a tax and payment breakdown.',
    showLogo: 'Print your uploaded logo at the top of the receipt.',
    showCashier: 'Print the name of the staff member who served the sale.',
    headerText: 'A short line under your business name — e.g. address or phone number.',
    footerText: 'A closing line — e.g. a returns policy or a thank-you message.',
  },
  customer: {
    name: 'The customer’s full name, shown at the till and on their history.',
    phone: 'Used to find the customer quickly at the till. Optional but recommended.',
    email: 'Optional — for sending receipts or marketing if you enable it later.',
    address: 'Optional delivery or billing address.',
    notes: 'Private notes about this customer. Never shown to them.',
  },
  storeCredit: {
    amount:
      'A positive number adds credit to the customer’s balance; enter the value to adjust by.',
    reason: 'Why the balance is changing — kept on the customer’s ledger.',
  },
  expense: {
    category:
      'The type of spend — rent, utilities, stock, wages — used to group expenses in reports.',
    amount: 'The total amount spent, including tax.',
    description: 'What the expense was for.',
    incurredOn: 'The date the money was actually spent, which may differ from today.',
    reference: 'An optional invoice or receipt number for your records.',
  },
  employee: {
    email: 'The address the invitation is sent to. They set their own password when accepting.',
    name: 'The person’s name as it will appear in the app and on sales they serve.',
    role: 'Determines what this person can see and do. You can change it later.',
    branch:
      'The branch this person works at. Their access is limited to it unless the role says otherwise.',
  },
  role: {
    name: 'A short label for this set of permissions, e.g. "Shift Supervisor".',
    description: 'What this role is for — helps whoever assigns it later.',
    permissions: 'Tick every action a holder of this role is allowed to perform.',
  },
  branch: {
    name: 'The branch or outlet name, shown throughout the app and on receipts.',
    address: 'The branch’s physical address, printed on receipts if no header text is set.',
    phone: 'A contact number for this branch.',
  },
  businessUnit: {
    name: 'The name of this sales operation within the branch (e.g. "Pharmacy", "Restaurant").',
    branch: 'Which branch this sales operation belongs to.',
    businessType:
      'Sets sensible defaults — starter categories, capabilities — for this kind of business.',
  },
  savedReport: {
    name: 'A name so you can find and re-run this report later.',
    description: 'Optional note on what this report is for.',
    visibility: 'Whether only you can see this saved report, or everyone in the organization.',
    branch: 'Limit the report to one branch, or leave as all branches.',
  },
  assignRole: {
    role: 'The role to give this person — it decides what they can see and do.',
    scope: 'Where the role applies: the whole organization, one branch, or one business unit.',
    businessUnit: 'Narrow the role to a single business unit within the chosen branch.',
  },
  posConfig: {
    taxRatePercentage:
      'The sales tax added to every sale at this business unit. Set 0 if you don’t charge tax.',
    taxInclusive: 'On: listed prices already include tax. Off: tax is added on top at checkout.',
    serviceChargePercentage:
      'An automatic charge added to every sale, e.g. a restaurant service charge.',
    discountMaxPercentage: 'The largest discount a cashier can apply without a manager’s approval.',
    discountMaxAmount:
      'The largest cash value of discount a cashier can apply unassisted. Blank means no cap.',
    discountRequiresAuthorization:
      'On: every discount needs a manager’s approval, whatever the size.',
    discountReasonRequired: 'On: a cashier must type a reason before any discount is accepted.',
    roundingMode: 'How the final total is rounded — useful where small coins aren’t used.',
    serviceChargeType: 'Whether the service charge is a percentage of the sale or a fixed amount.',
    serviceChargeValue: 'The percentage or fixed amount added to every sale as a service charge.',
    defaultPaymentMethod:
      'The payment method pre-selected at checkout — usually your most common one.',
  },
  inventory: {
    quantity: 'The number of units to add (positive) or remove (negative) from stock.',
    reason: 'Why stock is being adjusted — a count correction, damage, theft, a manual receipt.',
    note: 'Optional extra detail kept with the movement.',
    fromBranch: 'The branch the stock is leaving.',
    toBranch: 'The branch the stock is arriving at.',
    lowStockThreshold: 'When on-hand stock drops to this number, the product is flagged as low.',
  },
  organization: {
    displayName: 'Your business name as customers see it — on receipts and the customer display.',
    legalName: 'The registered legal name, used on formal documents. Can match the display name.',
    phone: 'A general contact number for the business.',
    email: 'A general contact email for the business.',
    address: 'The business’s main address.',
    defaultLowStockThreshold:
      'Any product whose available stock falls to this number is flagged as low — on the dashboard and by notification. A product with its own threshold set in Inventory uses that instead. Leave blank to disable.',
  },
  branding: {
    primaryColor: 'Your brand colour. It recolours buttons, links and highlights across the app.',
    logo: 'A square or wide logo, shown on receipts, the customer display and sign-in.',
  },
  report: {
    name: 'A name for this saved report configuration so you can re-run it later.',
    dateRange: 'The period the report covers.',
    branch: 'Limit the report to one branch, or leave as all branches.',
  },
  layaway: {
    customer:
      'The customer putting items on layaway. Required — a layaway is always against a customer.',
    depositAmount: 'The initial amount paid now. The rest is paid off in later instalments.',
    expiresOn: 'The date by which the layaway must be fully paid, or it is cancelled.',
    paymentAmount: 'How much the customer is paying toward the balance now.',
  },
  onboarding: {
    organizationName:
      'Your business name. You can refine how it appears on receipts later in Settings.',
    branchName: 'Your first branch or outlet. Add more later in Business Structure.',
    businessUnitName: 'The sales operation this branch runs — e.g. "Shop floor", "Pharmacy".',
    businessType: 'Pick the closest match — it seeds starter categories and sensible defaults.',
  },
} as const
