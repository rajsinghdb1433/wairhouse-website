'use strict';
// Default legal documents (Australian law). Editable from Admin > Pages. Placeholders like {{business_name}}
// are filled from Admin > Settings when a page is shown. Have a solicitor review these before you take payments.
module.exports = [
  { slug: 'terms', title: 'Terms of Service', category: 'legal', body: `
# Terms of Service

Last updated: {{updated}}

These Terms govern your use of the {{brand_name}} website and services (the **Platform**), operated by {{business_name}} (**we**, **us**). By creating an account or using the Platform you agree to these Terms. If you do not agree, do not use the Platform.

## 1. What we do
{{brand_name}} is an online marketplace. It lets people who have storage or warehouse space (**Owners**) list it, and people who need space (**Customers**) find and book it. **We are not a party to the storage agreement between an Owner and a Customer.** We provide the technology, payments facilitation, verification tools and support.

## 2. Accounts
- You must be 18 or older and able to enter into a binding contract.
- Give accurate information and keep it up to date. Keep your password private. You are responsible for activity on your account.
- We may suspend or close an account that breaks these Terms, creates risk for others, or is used for fraud.

## 3. Bookings and the storage agreement
- A booking request is an offer by the Customer. A booking is confirmed when the Owner accepts it (or when an Instant Book listing is booked).
- Once confirmed, the Customer and the Owner enter a storage licence on the {{brand_name}} Storage Rental Terms plus any extra terms the Owner shows on the listing.
- The storage is a licence to use space, not a lease of land. It does not create a tenancy.

## 4. Fees and payment
- Customers pay the listed price plus a service fee of {{service_fee_pct}}%. Owners pay a commission of {{owner_commission_pct}}% of the booking price (reduced or waived under any founding-owner offer shown on the Platform).
- Prices are in Australian dollars. Unless a listing says otherwise, prices include GST where GST applies. Owners are responsible for their own tax obligations.
- Payments are processed by a third-party payment provider. We do not store card numbers.
- We release the Owner payout after the booking starts, less our commission and any refunds.

## 5. Cancellations and refunds
Cancellations and refunds follow our Cancellation and Refund Policy. Nothing in these Terms limits your rights under the Australian Consumer Law.

## 6. What you must not do
- Break the law, or store or ask others to store anything covered by our Acceptable Use and Prohibited Goods Policy.
- Post false, misleading or infringing content, or fake reviews.
- Take bookings or payments off the Platform to avoid fees, for spaces first found on the Platform.
- Scrape, probe, overload or attack the Platform, or try to access accounts that are not yours.

## 7. Content you post
You keep ownership of your content (photos, descriptions, reviews). You give us a worldwide, non-exclusive, royalty-free licence to host, display and promote it for running the Platform. You promise you have the right to post it.

## 8. Reviews
Reviews must be honest and based on a real booking. We may remove reviews that break these Terms.

## 9. Our responsibility
- The Platform is provided "as is". We work hard to keep it running but do not promise it will be uninterrupted or error free.
- Owners and Customers deal with each other directly. We do not inspect every space and do not guarantee any listing, Owner, Customer or the condition of stored goods.
- **Nothing in these Terms excludes, restricts or modifies any right or remedy you have under the Australian Consumer Law or any law that cannot be excluded.** Subject to that, our total liability to you for any claim is limited to the fees you paid us in the 12 months before the claim, and we are not liable for indirect or consequential loss, loss of profit or loss of data.

## 10. Indemnity
You agree to cover reasonable losses we suffer because you broke these Terms or the law, or because of your content or your stored goods.

## 11. Privacy
We handle personal information as set out in our Privacy Policy.

## 12. Changes
We may update these Terms. We will tell you about material changes by email or notice on the Platform. Using the Platform after a change means you accept it.

## 13. Disputes and governing law
Try to resolve disputes with the other party first. For Customer and Owner disputes, our team can help mediate. These Terms are governed by the laws of {{governing_law}}, and the courts of that place have non-exclusive jurisdiction.

## 14. Contact
{{contact_name}}, {{business_name}}
Email: {{contact_email}}
Phone: {{contact_phone}}
` },
  { slug: 'privacy', title: 'Privacy Policy', category: 'legal', body: `
# Privacy Policy

Last updated: {{updated}}

{{business_name}} respects your privacy. This policy explains what personal information we collect, why, who sees it, and your choices. We follow the Privacy Act 1988 (Cth) and the Australian Privacy Principles. If you are in the EU or UK, we also apply the core GDPR rights described below.

## What we collect
- **Account details:** name, email, phone, company, ABN (owners), password (stored only as a one-way hash).
- **Bookings and messages:** dates, quantities, a short description of goods, and messages between customers and owners.
- **Owner payout details:** stored encrypted.
- **Listing content:** photos, descriptions, addresses.
- **Technical data:** IP address, device and browser type, pages used, and security logs. We use a small number of essential cookies to keep you signed in and protect forms.
- **Enquiries:** what you send through our contact form or email.

## Why we use it
- To run the marketplace: create accounts, show listings, process bookings and payouts.
- To keep the Platform safe: prevent fraud and abuse, enforce our Terms.
- To communicate: confirmations, security alerts, support replies and, only if you opt in or as allowed by law, marketing.
- To meet legal obligations, such as tax and record keeping.

## Who we share it with
- The other party to a booking, only what is needed (for example the Customer sees the exact address after confirmation; the Owner sees name and contact once confirmed).
- Service providers who help us run the Platform: hosting, email delivery, payments, security and analytics. They may only use data to provide services to us.
- Authorities, if the law requires, or to protect people and property.
- A buyer, if the business is sold, under the same protections.
We do not sell your personal information.

## Overseas disclosure
Some providers store data outside Australia. We take reasonable steps to make sure they protect it to a standard similar to the Australian Privacy Principles.

## Marketing and the Spam Act
We send marketing email only with consent or where the law allows, always identify us as the sender, and always include a working unsubscribe link. If you unsubscribe we will not send marketing to that address again. Owner outreach emails go to publicly listed business contact addresses, and one click on unsubscribe removes you permanently.

## How long we keep it
We keep account data while your account is open. After deletion we remove or anonymise personal data, but keep booking and payment records for 7 years as tax law requires.

## Security
We use encryption in transit, hashed passwords, encrypted payout details, access controls, rate limits, human checks on forms and security logging. No system is perfectly secure. If a breach is likely to cause serious harm we will notify you and the OAIC as the Notifiable Data Breaches scheme requires.

## Your rights
You can ask to access, correct, export or delete your personal information, and opt out of marketing at any time. Signed-in users can export or delete their account from Account settings, or contact us. If you are in the EU/UK you can also object to or restrict processing and complain to your local regulator. If you are unhappy with how we handled a request you can complain to the Office of the Australian Information Commissioner (oaic.gov.au).

## Cookies
See our Cookie Policy.

## Contact our privacy contact
{{contact_name}}, {{business_name}}
Email: {{contact_email}}  Phone: {{contact_phone}}
` },
  { slug: 'rental-terms', title: 'Storage Rental Terms', category: 'legal', body: `
# Storage Rental Terms (Customer and Owner)

Last updated: {{updated}}

These terms apply to every confirmed booking between a Customer (**you**) and an Owner. They sit alongside the Terms of Service and any extra terms the Owner shows on the listing.

## 1. The licence
The Owner gives you a non-exclusive licence to use the space described in the booking, for the dates and quantity shown, to store lawful goods. It is not a lease and you do not get possession of the property.

## 2. What you can store
Only goods that you own or have the right to store, described honestly in your booking. You must follow the Acceptable Use and Prohibited Goods Policy. No living things, no food that needs refrigeration (unless the space is cold storage and the Owner agreed), and no hazardous materials.

## 3. Access
Access follows the hours on the listing and the Owner's reasonable site rules (safety gear, booking dock times, ID checks). The Owner may enter the space in an emergency, or where the law requires, and will tell you as soon as practical.

## 4. Condition and care
You must keep goods packed safely, within the space you booked, not blocking exits, fire equipment or other users. Pallets must be stable and within the stated weight limit. You must tell the Owner of any damage you cause.

## 5. Insurance
Goods are stored **at your risk**. The Owner is not an insurer of your goods. Unless the listing says insurance is included, you should arrange your own insurance. Owners must hold appropriate public liability and property insurance for the site.

## 6. Payment and overdue amounts
You pay through the Platform. If an amount is not paid, the Owner may suspend access and, after written notice and a reasonable time, deal with goods as the law allows. This does not remove your duty to pay.

## 7. Ending early or late
Cancellation follows our Cancellation and Refund Policy. If you stay beyond the end date without agreeing an extension, the Owner may charge the daily rate for each extra day. Extensions are made through the Platform.

## 8. Liability
Each party is responsible for loss or damage it causes. The Owner is not liable for loss of goods from events outside their reasonable control, but is responsible for loss caused by their own negligence. Nothing here limits rights under the Australian Consumer Law.

## 9. Disputes
Raise problems with the other party first and contact {{brand_name}} support within 7 days of discovering them. We may help mediate but are not required to decide the dispute.
` },
  { slug: 'host-agreement', title: 'Owner (Host) Agreement', category: 'legal', body: `
# Owner (Host) Agreement

Last updated: {{updated}}

This agreement is between you (**Owner**) and {{business_name}} when you list space on {{brand_name}}.

## 1. Your promises
- You own the space, or you are the occupier with a written right to let others use it, including permission from the landlord and any strata or owners corporation.
- Your use of the space is allowed by local council zoning, planning, fire, building and workplace safety rules.
- Your listing is accurate: address, size, height, access hours, price, features and photos are true and current.
- You hold appropriate insurance, including public liability, for the site and activity.
- You will respond to booking requests promptly and honour confirmed bookings.

## 2. Fees
- Listing is free. We charge a commission of {{owner_commission_pct}}% of each booking price, taken from your payout.
- Founding owner offer: owners who join under the founding offer shown on the Platform pay the reduced commission for the period stated there. We may change fees with 30 days' notice; changes do not affect bookings already confirmed.
- You are responsible for your own tax, including GST and income tax. We may provide statements to help you.

## 3. Payouts
We pay the booking price less commission to the payout details you provide, after the booking starts. We may delay or withhold payouts for suspected fraud, chargebacks, or unresolved disputes, and will explain why.

## 4. Safety and goods
You must keep the space safe, secure and as described. You must not store or knowingly allow prohibited goods. If you find prohibited or dangerous goods you must tell us and the Customer straight away and, if there is danger, call emergency services.

## 5. Taking bookings off-platform
For customers first introduced through {{brand_name}}, bookings must be made and paid on the Platform for the first 12 months after introduction.

## 6. Your content
You give us a licence to display your photos and descriptions on and in connection with the Platform (including marketing). You promise you have the right to do so.

## 7. Ending
You can pause or remove a listing at any time, after completing confirmed bookings. We can suspend or remove listings that break this agreement or put people at risk.

## 8. Liability
You are responsible for loss or damage caused by your negligence. Our liability to you is limited as set out in the Terms of Service. Nothing here excludes rights under the Australian Consumer Law.

## 9. Governing law
The laws of {{governing_law}} apply.
` },
  { slug: 'cancellation', title: 'Cancellation and Refund Policy', category: 'legal', body: `
# Cancellation and Refund Policy

Last updated: {{updated}}

## Before the owner accepts
Cancel any time at no cost. You are not charged until the booking is accepted.

## After the owner accepts
- **7 or more days before the start date:** full refund of the price and service fee.
- **2 to 6 days before the start date:** refund of the price, less the service fee.
- **Less than 48 hours before, or after the start date:** no refund for the first period; any unused full periods are refunded once the Owner has re-let or confirmed the space is empty.
Individual listings may offer a more generous policy, shown on the listing.

## If the owner cancels
You receive a full refund, including the service fee, and we will help you find another space. Owners who cancel confirmed bookings may be penalised or removed.

## If the space is not as described
Contact us within 48 hours of access. If the listing was materially wrong (for example size, access, safety or cleanliness) we will refund the unused period, or help move you to a comparable space.

## Australian Consumer Law
You may have rights to a repair, replacement or refund under the Australian Consumer Law. Nothing in this policy limits those rights.

## How refunds are paid
Refunds go back to the original payment method within 5 to 10 business days.

## Contact
{{contact_email}} or {{contact_phone}}
` },
  { slug: 'acceptable-use', title: 'Acceptable Use and Prohibited Goods', category: 'legal', body: `
# Acceptable Use and Prohibited Goods

Last updated: {{updated}}

Everyone using {{brand_name}} must keep storage safe and lawful.

## Never store
- Illegal goods, stolen goods, or goods you are not entitled to store.
- Explosives, fireworks, ammunition and flammable or combustible liquids or gases (including fuel, paint thinners and gas cylinders) unless the listing is a licensed dangerous goods store and the Owner has approved it in writing.
- Firearms and weapons, unless lawfully licensed and the Owner has agreed in writing.
- Hazardous, toxic, radioactive or biological materials, asbestos and chemicals.
- Living animals or plants, human or animal remains.
- Perishable food, unless the space is cold storage and the Owner has agreed.
- Anything that smells, leaks or attracts pests.
- Cash, jewellery, or items of unusual value without telling the Owner and arranging suitable insurance.

## Never use a space to
- Live, sleep or run a business that needs customers visiting, unless the listing allows it.
- Make or sell illegal goods, or run any unlawful activity.
- Block fire exits, sprinklers, electrical boards or other customers' space.

## On the Platform
Do not post fake listings, fake reviews or misleading photos. Do not harass others, spam, scrape, or try to bypass our security. We may remove content and suspend accounts that break these rules and report serious matters to police.

## Reporting
If you see something unsafe or unlawful, tell us right away at {{contact_email}} or {{contact_phone}}.
` },
  { slug: 'cookies', title: 'Cookie Policy', category: 'legal', body: `
# Cookie Policy

Last updated: {{updated}}

{{brand_name}} uses only a small number of cookies and similar storage, and we do not use advertising or cross-site tracking cookies.

## Essential (always on)
- **Session cookie:** keeps you signed in. Secure, HttpOnly, expires when you sign out or after a set time.
- **Security tokens:** protect forms and sign-in from forgery and bots.

## Preferences (stored on your device)
- Your cookie choice, recently viewed searches and theme choices.

## Optional
If analytics or a Cloudflare Turnstile human check are enabled by us, they may set their own cookies. We will list them here and ask first where the law requires.

You can block cookies in your browser, but signing in will not work without the session cookie.
` },
  { slug: 'about', title: 'About wAIRhouse', category: 'info', body: `
# Space, on demand.

{{brand_name}} makes unused warehouse and storage space useful again. Businesses get flexible, verified space by the day, week or month. Owners turn empty racking, sheds, containers and yards into steady income.

## Why we exist
Across Australia there is a lot of space sitting empty, while small businesses, online sellers, tradies, event crews and families struggle to find storage without signing long, expensive contracts. We built {{brand_name}} to match them in minutes.

## What we stand for
- **Flexible:** book for a week or a year. No lock-in.
- **Fair:** low fees and clear prices up front. No surprises.
- **Safe:** verified owners, clear rules, and real people to call.

## Meet the founder
{{contact_name}} started {{brand_name}} to make storage as easy to book as a holiday stay. Say hello any time on {{contact_phone}} or {{contact_email}}.
` },
];
