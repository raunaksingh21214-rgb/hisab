# Hisab — Personal Expense & Debt Ledger with WhatsApp Reminders

A sleek, offline-first personal financial ledger and expense tracker built with modern HTML5, CSS3, and JavaScript. Keep track of money you give or take, record itemized expenses with categories, and send instant 1-click WhatsApp and SMS payment reminders to your contacts.

---

## 🚀 Quick Start

No installation or node setup required!
Simply **double-click** `index.html` or open it in any web browser (Google Chrome, Microsoft Edge, Safari, Firefox, or on mobile).

---

## ✨ Features

### 1. Give & Take Ledger (Khata / Splitwise style)
- **To Receive**: Total amount people owe you (+).
- **To Pay**: Total amount you owe other people (−).
- **Net Balance**: Overall financial standing at a glance.
- **Smart Contact Cards**:
  - Colored status badges: **They owe you** (Green), **You owe them** (Red), or **Settled Up** (Gray).
  - Quick action buttons: `+ Gave`, `− Got`, `Settle Up`, `Remind`, `History`.
  - Displays "Last reminded" relative time (e.g., *Reminded 2h ago*).

### 2. Full Expense Tracker & Activity Feed
- **Central Activity Log**: See every transaction chronologically across all contacts.
- **Expense Categories with Icons**:
  - 🍔 Food & Drinks
  - 🚗 Travel & Fuel
  - 🏠 Rent & Bills
  - 🛒 Groceries & Shopping
  - 🎉 Entertainment
  - 💸 Loan & Cash
  - 🔄 Settle Up
  - 🏷️ Other
- **Payment Method Tracking**: UPI / Online, Cash, Card, Bank Transfer.
- **Filters & Search**: Filter by type (+ Gave / − Got), category, or search by notes and contact names.
- **Spending Analytics & Visual Breakdown**:
  - Category distribution bars with percentages.
  - Top pending balances (who owes the most).

### 3. WhatsApp & SMS Direct Automation Suite
- **⚡ Direct Background WhatsApp Sending (Zero manual taps)**:
  - Connect your personal WhatsApp in 1 minute using **Green API** or **UltraMsg** (free developer accounts).
  - Just scan the QR code once in your phone's WhatsApp Linked Devices, paste your Instance ID & Token into Hisab Settings.
  - From then on, clicking **"Send on WhatsApp"** delivers the message **directly in the background** without opening WhatsApp tabs or requiring you to press send manually!
- **🔗 Fast 1-Click WhatsApp Launch (No API mode)**:
  - Automatically skips the slow `wa.me` "Continue to Chat" middle page:
  - On Desktop: Jumps directly into **WhatsApp Web** chat with the text already loaded.
  - On Mobile: Launches the native **WhatsApp app** directly with no browser redirects.
- **💬 Direct SMS Messages (Fixed for both PC & Mobile)**:
  - **Fast2SMS Integration (Free India SMS)**: Add a free Fast2SMS API key in Settings to send real SMS directly to mobile phones from your computer!
  - **Twilio SMS (Worldwide)**: Direct cloud SMS delivery worldwide.
  - **Mobile Fix**: Native DOM intent dispatching so Android and iOS open their default Messages app immediately without getting blocked by popup blockers.
  - **Desktop PC Helper**: On computers without a cellular SIM, provides instant 1-click options to open **Google Messages Web** (synced with your phone) or copy text & number with 1 tap.
- **1-Click Copy**:
  - Copies formatted text to clipboard to paste into Instagram, Telegram, Messenger, etc.
- **Customizable Reminder Tones**:
  - ⚡ **Casual & Friendly**: *"Hey Rahul! Quick friendly reminder about ₹500 pending with you. Whenever you get a moment, please send it over. Thanks! 🙌"*
  - 💼 **Polite & Formal**: *"Dear Rahul, this is a gentle reminder regarding the outstanding balance of ₹500. Kindly settle this when convenient."*
  - 🧾 **Itemized Breakdown**: Shows recent items with bullet points (e.g. *• ₹300 (Dinner) • ₹200 (Cab)*).
  - 🚨 **Urgent**: Prompt message for immediate settlement.
- **⚡ Direct UPI Link & On-Screen QR Code**:
  - Add your UPI ID in Settings (e.g. `yourname@upi`).
  - Appends clickable UPI payment link in reminders.
  - Generates an on-screen QR code that your friend can scan with Google Pay, PhonePe, Paytm, or BHIM.

### 4. 1-Click Settle Up
- Click **"Settle"** on any contact card to automatically pre-fill the exact outstanding balance, balance type, and a *"Settled balance in full"* note to bring their account to zero in 1 tap.

### 5. Printable Statements & WhatsApp Ledger Sharing
- **1-Click WhatsApp Statement**: Share an itemized breakdown of past transactions directly over WhatsApp.
- **Printable Statements**: Click **"Statement"** in any contact's history dialog to preview and print a clean, formatted itemized statement or save as a PDF.

### 6. Privacy, PWA & Data Backup
- **100% Private & Offline**: All data is saved securely in your browser's `localStorage`. No third-party servers or tracking.
- **PWA Ready**: Install as a native standalone app on Android, iPhone, or Windows PC.
- **Real Scannable QR Codes**: Offline QR code generation that actually scans with Google Pay, PhonePe, Paytm, and BHIM.
- **Audio Chimes**: Subtle, satisfying audio cues on transactions and settlements.
- **JSON Backup & Restore**: Download a backup file anytime and restore on any device.
- **CSV Export**: Export your entire transaction history to CSV format for Excel or Google Sheets.
- **Load Demo Data**: One-click demo loader to test the app with realistic sample transactions.

### 7. Modern UI with Dark Mode
- Smooth Dark / Light theme toggle with automatic theme memory.
- Responsive mobile & desktop layout.

---

## 📁 File Structure

```text
├── index.html     # Semantic HTML5 app with tabs, modals, and templates
├── styles.css     # Responsive design system with light/dark theme variables
├── app.js         # State management, ledger math, reminders, and exports
├── qr.js          # Pure JS offline camera-scannable QR code generator
├── manifest.json  # PWA manifest for Add to Home Screen / Mobile App install
└── README.md      # Documentation and user guide
```

---

## 🛠️ Settings & Customization
Click **"Settings"** in the top navigation bar to configure:
1. **Your Name**: Displayed in reminder signatures.
2. **Currency Symbol**: Defaults to `₹` (Indian Rupee), supports `$`, `€`, `£`, or any local currency.
3. **Default Country Code**: Defaults to `91` (India), customizable for any country.
4. **UPI ID**: For instant UPI payment requests and QR code scanning.
