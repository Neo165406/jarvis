# Jarvis

ফোনে ইনস্টল করার মতো Jarvis (PWA)। Claude-চালিত voice/chat, HUD, অ্যাকশন প্যানেল (PC ও বাড়ি), আর অ্যাপ বন্ধ থাকলেও আসা রিমাইন্ডার নোটিফিকেশন।

## ১. অ্যাপ চালু করা (GitHub Pages)

1. এই রিপোর Settings > Pages খুলুন।
2. Source: Deploy from a branch, Branch: `main`, folder: `/ (root)` দিয়ে Save করুন।
3. এক-দুই মিনিট পর ঠিকানা হবে `https://<আপনার-ইউজারনেম>.github.io/jarvis/`।
4. Android Chrome-এ ঠিকানাটা খুলে মেনু > Install app (বা Add to Home screen) দিন।

## ২. রিমাইন্ডার সার্ভার (Cloudflare Workers, ফ্রি)

1. dash.cloudflare.com এ একাউন্ট খুলুন। Workers & Pages > Create > Hello World Worker বানান।
2. Edit code খুলে `worker/worker.js`-এর পুরো কোড পেস্ট করে Deploy দিন।
3. Storage & Databases > KV > একটা namespace বানান (নাম যা খুশি)।
4. Worker-এর Settings > Bindings > Add > KV namespace। Variable name লিখুন `JARVIS_KV`, বানানো namespace বেছে নিন।
5. Settings > Variables and Secrets > Add: নাম `API_TOKEN`, মান একটা লম্বা গোপন পাসওয়ার্ড (Secret হিসেবে)।
6. Settings > Trigger Events > Cron Triggers > Add: `* * * * *` (প্রতি মিনিটে)।

## ৩. অ্যাপে সেটআপ

Setup ট্যাবে দিন:
- Claude API key (console.anthropic.com থেকে; এতে খরচের সীমা বেঁধে দিন)
- Server address (আপনার `*.workers.dev` ঠিকানা) ও Access token (`API_TOKEN`-এ যেটা দিয়েছেন)

তারপর Save settings > Turn on notifications > Send a test।

## সীমাবদ্ধতা

- রিমাইন্ডার নোটিফিকেশন আসতে সর্বোচ্চ প্রায় ১ মিনিট দেরি হতে পারে।
- Android-এর ব্যাটারি অপ্টিমাইজেশন Chrome-কে আটকালে নোটিফিকেশন দেরিতে আসতে পারে। Chrome-কে Unrestricted করে দিন।
- অ্যাকশনগুলো শুধু https ঠিকানা ডাকতে পারে (Chrome plain http আটকে দেয়)।
- PC কন্ট্রোলের জন্য আপনার PC-তে আলাদা একটা ছোট প্রোগ্রাম লাগবে, যেটা https দিয়ে পৌঁছানো যায়।
