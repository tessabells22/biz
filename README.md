# Happi Bubbles POS 🫧

A free POS and back office for the **Happi Bubbles** laundry shop, built as a replacement for Loyverse.
The same app runs as:

- **Android / iOS app** (via Capacitor) for the counter
- **Browser back office** for the owner (reports, items, employees, settings)

It works fully offline. Turn on optional **cloud sync** (free Supabase project) so every phone and the browser share the same data.

## Features

**POS (phone / tablet)**
- Employee login with 4-digit PIN (owner, manager, cashier roles)
- Service grid by category, search, per-load / per-kilo (weighed) / per-piece / retail pricing
- Customers with loyalty points, discounts (percent or fixed), notes, bag count, pickup date
- Payments: Cash (with change and quick-cash buttons), GCash, Maya, Card, Bank Transfer (editable), partial payment, or **pay on pickup**
- Claim-slip receipt: print, share, or copy
- **Laundry order board**: Received → Washing → Drying → Folding → Ready → Claimed, overdue alerts, unpaid filter
- One tap **"Text customer"** SMS when laundry is ready (message template in Settings)
- Collect balances on pickup, refunds (manager/owner)
- Shifts: opening cash, pay in / pay out, expected vs counted cash at close

**Back office (browser)**
- Dashboard: net sales, collected payments, unpaid balances, sales chart, jobs in the shop, low stock
- Sales reports: summary, by item (with profit), by category, by employee, by payment method, by hour, with CSV export
- Receipts list with search and CSV export
- Items and services, categories, discounts
- Inventory: stock tracking for supplies (detergent, fabcon…), receive / count / loss adjustments, history
- Customers with visit history and amounts owed
- Employees and PINs, shift history
- Settings: shop info, receipt text, payment methods, tax/VAT, loyalty, turnaround, device letter, cloud sync, backup/restore

## Quick start

```bash
npm install
npm run dev        # open http://localhost:5173
```

Log in with the default owner PIN **1234**, then change it in **Back Office → Employees**.
A starter catalog (Full Service ₱180, Per Kilo ₱35, etc.) is created on first run; edit prices in **Items & services**.

Other scripts: `npm test`, `npm run typecheck`, `npm run build`.

## Cloud sync (shared data between phones and the browser)

1. Create a free project at <https://supabase.com>.
2. Open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql), and run it.
3. In **Project Settings → API**, copy the Project URL and the `anon` public key.
4. Either put them in `.env` (see `.env.example`) before building, or enter them in the app under **Back Office → Settings → Cloud sync**.
5. On the first device, tap **Create shop account** (email + password). On every other device, **Sign in** with the same account.

How it works:
- Every device keeps a full local copy (IndexedDB), so the POS keeps working without internet and syncs when back online.
- Changes sync within seconds (live updates) using last-write-wins per record.
- Give each POS device its own **device letter** (Settings → This device) so claim numbers never collide (`A0924-001`, `B0924-001`).
- When a new device signs in to an account that already has data, it adopts the cloud data.

## Back office in the browser

`npm run build` produces a static site in `dist/`. Host it for free on Netlify, Vercel, Cloudflare Pages or GitHub Pages, then open it on any computer, log in with an owner/manager PIN, and click **Back Office**. With cloud sync on, it shows the same data as the phones.

## Android and iOS apps

Native projects are in `android/` and `ios/` (Capacitor).

```bash
npm run cap:android   # builds the web app, syncs, opens Android Studio
npm run cap:ios       # builds, syncs, opens Xcode (macOS only)
```

- **Android**: in Android Studio, *Build → Generate Signed App Bundle / APK*. An APK can be installed directly on the shop phones without the Play Store.
- **iOS**: in Xcode, set your Apple team under *Signing & Capabilities*, then run on a device or archive for TestFlight / App Store.
- The app icon uses the Happi Bubbles logo.

Tip: the web app is also installable as a PWA ("Add to Home Screen") if you don't want to build native apps yet.

## Printing receipts

- **Browser / PC**: *Print* uses the system print dialog, sized for 58 mm thermal paper.
- **Phones**: use *Share* to send the receipt to a printer app (e.g. RawBT on Android for Bluetooth thermal printers), Messenger, or SMS.

## Project layout

```
src/lib/        data layer (Dexie), order/shift logic, reports, cloud sync
src/pos/        POS screens (sale, checkout, order board, shift)
src/admin/      back office screens
src/components/ shared UI, receipts, order details
supabase/       cloud database schema
android/ ios/   Capacitor native projects
```
