# Local UI review · 18 October 2026

This optional route provides a local UI review workspace. Production requires normal restaurant sign-in; the review route returns 404.

- Staff preview: http://localhost:5090/preview
- Customer preview: http://localhost:5090/preview?customer=1
- Sign-in page: http://localhost:5090/signin

The preview entry creates a dedicated, labelled demo workspace in local embedded storage, with a sample menu, 12 tables and six unpaid orders. It never records sales or verified payments. The preview session is held in memory for the running development server; no demo password is stored in source.

## Start

Use development mode with `DATABASE_URL` and `VERCEL` unset, set `LOCAL_DATABASE_PATH=.data/ui-refresh`, and run `npm run dev` from the codebase root. The preview entry returns 404 for production mode, Vercel, any configured PostgreSQL connection, other local storage paths or a non-loopback hostname. Normal account creation/sign-in remains available independently.

## Design

The shared screen theme is `apps/web/src/styles/interface.css`: forest green navigation and actions, white surfaces, consistent spacing and stronger typography. Repeated outlet labels, decorative arrows, marketing filler and the design-review navigation link have been removed from operational screens. Secondary screens are under Manage. Navigation remains full-width with 22px icons, 15px labels and 52px menu rows, including inside the mobile drawer. Ctrl K / Cmd K opens the role-filtered page finder. QR management uses compact screen cards and separate full print cards. Card borders, subtle shadows and a warm off-white canvas distinguish each surface. Typography retains the approved sizing outside the larger navigation. Functional descriptions, field validation and business limits remain available where needed. Print layouts are separate from the screen theme.

## Verification

All 25 staff pages were checked at 1440 and 390 pixels, along with the customer menu and cart, sign-in, mobile navigation and a form dialog. No page overflow, browser runtime errors, empty unlabelled buttons or decorative arrow text were found. Order-to-invoice and customer QR browser workflows pass. The development preview entry is also checked to reject other storage configurations.

Screenshots and the visual check report are in `verification/ui-refresh/` and are excluded from deployment/source packaging.
