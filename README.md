# Grocery POS

An offline-first point of sale for Android and PC. It runs in the browser, installs like a normal app, and keeps working with no internet.

## Try it right now (1 minute)
Double-click `index.html`. Create your store, add the sample products if you want, and make a test sale.

## Put it online for free (so phones and PCs can install it)
Pick one:
- **Netlify Drop:** go to app.netlify.com/drop and drag this whole folder in. You get a link right away.
- **Cloudflare Pages / GitHub Pages:** upload the folder the same way.

Then open the link:
- **Android (Chrome):** menu → *Install app* / *Add to Home screen*.
- **Windows (Chrome or Edge):** click the install icon in the address bar.

## Share stock across several devices (free)
Without this, each device keeps its own separate stock. To share one stock and sales record:
1. Create a free project at supabase.com.
2. SQL Editor → paste the SQL shown in the app (Settings → Devices & cloud → Copy SQL) → Run.
3. Project Settings → API → copy the **Project URL** and the **anon public key**.
4. In the app: Settings → Devices & cloud → Connect. Paste them and choose a long secret **store code**.
5. On every other device, open the app and tap **Connect** with the same three values.

Devices sync every few seconds. If the internet drops, sales are kept on the device and uploaded when it comes back.

**Honest security note:** the anon key is public by design, and the SQL gives anyone who has the URL, key and your store code access to that store's data. Use a long random store code and don't share it. PINs are stored hashed, but they are only a convenience lock, not strong protection.


## Windows app (GroceryPOS.exe): no accounts needed
Double-click `GroceryPOS.exe` on the shop PC. It opens the POS in its own window and shows a box with the address for other devices.
- **Phones and other PCs on the same Wi-Fi:** open the address from the box (like `http://192.168.1.5:8787`). Pick your name, enter your PIN. Accounts, products and stock are shared automatically. Nothing to set up and nothing goes online.
- **Where the data lives:** in a file on the shop PC (the box shows the path). Download a backup now and then: Settings → Data.
- Keep the box open while you work; click OK to stop. Phones need the shop PC to be on.
- Windows may show "Windows protected your PC" because the file is not code-signed: click **More info → Run anyway**. If the Firewall asks, allow **Private networks**.
- Anyone on the shop Wi-Fi can open the address, so keep the Wi-Fi password private.

## Check stock from anywhere (Supabase + GitHub Pages, both free, one-time setup)
Supabase keeps your data online. GitHub Pages hosts the app files so any device can open it with the shop PC off.
1. **Supabase:** sign up at supabase.com, create a project. Open *SQL Editor*, paste the SQL (in the app: Settings → Devices & cloud → Copy SQL), press Run. Then *Project Settings → API*: copy the **Project URL** and the **anon public** key.
2. **GitHub Pages:** sign up at github.com, create a **public** repository named `pos`, choose *uploading an existing file*, drag in the files from this folder (the files, not the folder), Commit. Then *Settings → Pages → Branch: main → Save*. After about a minute your link is `https://YOURNAME.github.io/pos/`.
3. **Connect the shop PC:** Settings → Devices & cloud → "Use an online cloud instead…" (or Connect to cloud), paste the URL, key and a long secret store code. Everything on the PC uploads.
4. **Other devices:** on the PC tap **🔗 Link for other devices**, paste your GitHub link, send the copied link to your tablet or phone and open it. It connects by itself; pick your name and enter your PIN. In Chrome use menu → *Add to Home screen* to install it.

Notes:
- Use **one** way for everyone. After switching to the cloud, phones and tablets should open the GitHub link, not the exe's Wi-Fi address (otherwise they would sync with the PC instead of the cloud).
- The link contains your cloud key and store code: treat it like a password. PINs are only a convenience lock.
- The public GitHub repository contains only the app code, never your data or keys.
- Free Supabase projects can pause after about a week with no use; just press Restore in the Supabase dashboard.

## What's inside
- PIN login with Owner and Cashier roles
- POS: search by name or barcode, categories, best-sellers first, held orders, discounts, cash change, GCash/Maya/Card/Utang
- Stock: receive, remove, count, low-stock and expiry alerts, CSV import/export
- Sales history, void, mark utang paid, receipts you can print
- Reports: sales, profit, busiest hours, top products, categories, utang owed, restock list
- Product photos: take a photo or upload one per product (auto-resized, stored on device and synced)
- Settings: theme (Onyx, Midnight, Charcoal, Light, Cream), accent color, density, tile size, text size, categories, VAT, payment methods, discount limits, team, backup/restore

Shortcuts on PC: **F2** focus search, **F9** charge. A USB barcode scanner works as-is: scan and it adds the item.

## Update the app
Change the files and re-upload. Open devices pick up the new version on the next load.
