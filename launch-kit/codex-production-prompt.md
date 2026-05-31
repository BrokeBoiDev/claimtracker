Upgrade ClaimTrack into a hosted SaaS.

Current app:
- Vite React entry in `src/`
- shared styling in `styles.css`
- Supabase schema in `supabase/schema.sql`

Product:
ClaimTrack is a customer repair-status portal for collision repair and auto body shops.

Keep the design direction:
- Light dashboard surface
- Dark left sidebar
- Serious shop-management tone
- Dense but readable repair records
- No inflated marketing copy

Build requirements:
1. Keep the Vite React app production-ready.
2. Add Supabase Auth.
3. Add protected shop dashboard.
4. Store application data in Supabase Postgres.
5. Add database tables:
   - shops
   - repairs
   - customers
   - parts
   - insurance_notes
   - photo_updates
   - pickup_checklists
   - review_messages
   - settings
6. Add Supabase Storage for uploaded repair photos.
7. Add Stripe subscription checkout.
8. Add shop onboarding.
9. Add team member invitations.
10. Add customer-facing repair status links.
11. Add README with setup steps.
12. Keep the copy plain, specific, and useful to a service advisor.
