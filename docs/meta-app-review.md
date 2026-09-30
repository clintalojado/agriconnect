# Making the Messenger bot public (Meta App Review)

While the Meta app is in **Development** mode, the bot only answers people with a
role on the app (admins, developers, testers). To answer **anyone** who messages
the AgriConnect M'lang Page, the app needs **Advanced Access** to
`pages_messaging` (granted through App Review) and must be switched to **Live**.

Until then, anyone can test the same bot in the website chat:
<https://agriconnect-61co.onrender.com/?chat=1>

Meta changes its dashboard often. If a button isn't where this guide says,
look for the closest match.

## Checklist

- [x] Webhook connected, signature-checked, `messages` subscribed
- [x] Privacy Policy and Data Deletion pages live; `DELETE MY DATA` works in the bot
- [x] App icon ready (`docs/meta/app-icon-1024.png`)
- [x] "Get Started" button and greeting (set automatically when the server starts)
- [ ] Also tick **`messaging_postbacks`** in the Page's webhook subscriptions (so the Get Started tap reaches the bot)
- [ ] App settings → Basic filled in (section 2)
- [ ] Business verification (section 3)
- [ ] App Review submitted with screen recording (section 4)
- [ ] Switched to Live after approval (section 5)

## 1. Pages Meta asks for (already live)

| Field | URL |
|---|---|
| Privacy Policy URL | https://agriconnect-61co.onrender.com/privacy |
| Data deletion instructions URL | https://agriconnect-61co.onrender.com/data-deletion |
| Website / App domain | agriconnect-61co.onrender.com |

Users delete their data by sending `DELETE MY DATA`, then `CONFIRM DELETE`, to
the bot (Messenger, SMS, or website chat).

## 2. App settings → Basic

- **App icon:** upload [`docs/meta/app-icon-1024.png`](meta/app-icon-1024.png) (1024×1024, ready to use).
- **Privacy Policy URL** and **User data deletion → Data deletion instructions URL:** from the table above.
- **Category:** Business and pages (or Utility and productivity).
- **Contact email:** an email you check.
- Click **Save changes**.

## 3. Business verification

For Advanced Access, Meta usually requires the app to belong to a **verified
business portfolio** (Business Settings → Security Center → Start verification).
It asks for a registered name, address, phone, website, and a document such as a
DTI, SEC, CDA (cooperative), or BIR registration.

A student usually can't verify on their own. Options:
- A **partner cooperative, LGU office (e.g. the MAO), or the school** creates or
  owns the business portfolio, verifies it, and adds you as an admin; then connect
  the app to that portfolio (App settings → Basic → Business portfolio).
- If Meta lets the review go ahead without verification for a Page-owned bot, skip this.

## 4. Request Advanced Access for `pages_messaging`

1. App dashboard → **Use cases** → *Engage with customers on Messenger from Meta* → **Customize**.
2. In **Messenger API Settings**, open **3. Complete App Review** → **Request permission**
   (or App Review → Permissions and features → `pages_messaging` → **Request advanced access**).
3. Also request `pages_manage_metadata` if it is listed as required (it lets the app subscribe the Page to webhooks).

### What to write — "How will your app use pages_messaging?"

> AgriConnect helps small-scale farmers in M'lang, Cotabato (Philippines) order
> fertilizer, seeds, pesticides, and animal feeds from verified local suppliers.
> Farmers message our Facebook Page in Tagalog, Bisaya, or English. Our bot
> replies only to messages the farmer sends first: it registers the farmer (name,
> barangay, town), reads their order (e.g. "5 sako urea"), asks them to confirm
> with "OO", and answers questions about prices, delivery areas, order status,
> and payment. When suppliers send quotations, the farmer is informed in the same
> conversation within the 24-hour messaging window. We do not send promotional
> or unsolicited messages. Farmers can delete their data by sending
> "DELETE MY DATA".

### Step-by-step instructions for the reviewer

> 1. Open Messenger and send a message to the Facebook Page "AgriConnect M'lang".
> 2. Send: Hello — the bot replies and asks for your name.
> 3. Answer: Test Reviewer → barangay: Katipunan → town: M'lang → phone: SKIP → confirm: OO.
> 4. Send: 5 sako urea — the bot shows the order it understood and asks to confirm.
> 5. Reply: OO — the bot confirms the request was sent to suppliers.
> 6. Send: may delivery ba sa dalipe? — the bot lists suppliers that deliver there.
> 7. Send: STATUS — the bot shows your request status.
> 8. Send: DELETE MY DATA, then CONFIRM DELETE — your data is deleted.
> The same bot can also be tried without Facebook at https://agriconnect-61co.onrender.com/?chat=1

### Screen recording (required)

Record your phone screen (1–3 minutes) doing steps 1–8 above in the **Messenger
app**, showing each message and the bot's reply. Before recording:

- Open https://agriconnect-61co.onrender.com once, so the server is awake.
- Don't push code updates on the day you record or during review (a restart wipes test data).

Upload the video in the permission request and click **Submit for review**.

## 5. After approval

1. App dashboard → **Publish** (or the Development/Live switch) → switch to **Live**.
2. Message the Page from an account that has **no role** on the app, to confirm the bot answers everyone.

Review usually takes a few days to two weeks. If Meta rejects it, read the
reason, fix that item (often the screencast or the use-case text), and resubmit.
