# What do you think about Solstice?

A single-page feedback wall. Visitors enter a username (and optionally a
profile picture), then post one short take that scrolls across a
five-row marquee feed. One submission per username, capped at 200 active
takes, stored in Firebase so it persists for every visitor.

## Files

| File                          | Purpose                                                              |
|--------------------------------|-----------------------------------------------------------------------|
| `index.html`                   | Page markup only                                                    |
| `style.css`                    | All styling                                                          |
| `script.js`                    | UI behavior (inputs, validation, rendering the marquee)              |
| `firebase.js`                  | Firebase init + Firestore read/write functions                       |
| `firebase-config.example.js`   | Template for your Firebase credentials — copy, don't edit directly   |
| `README.md`                    | This file                                                             |

## Setup

### 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project.
2. In the project, go to **Build → Firestore Database** and click **Create database**. Start in production mode.
3. Go to **Project settings → General → Your apps**, click the **</>** (web) icon, and register an app. You don't need Firebase Hosting for this step.
4. Copy the `firebaseConfig` object Firebase shows you.

### 2. Add your config

Copy the example file to a real config file:

```bash
cp firebase-config.example.js firebase-config.js
```

Open `firebase-config.js` and paste in the values from step 1.4.

`firebase-config.js` holds your Firebase **client** config (apiKey,
projectId, etc). These values are not secret — they're meant to be
public, since the browser needs them to talk to Firebase. What
actually protects your data is the Firestore security rules from step
3, not hiding this file. You can safely commit `firebase-config.js` to
GitHub and deploy it — in fact, for a static host like Vercel that's
the simplest path, since there's no build step to inject secrets at
deploy time.

If you'd rather keep it out of a public repo anyway, that's fine too —
just remember Vercel will need the file present at deploy time some
other way (e.g. uploading it directly through Vercel's dashboard, or
keeping the repo private).

### 3. Set Firestore security rules

In the Firebase Console, go to **Firestore Database → Rules** and use:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /takes/{username} {
      allow read: if true;
      allow create: if request.resource.data.text.size() > 0
                    && request.resource.data.text.size() <= 200
                    && !exists(/databases/$(database)/documents/takes/$(username));
      allow update, delete: if false;
    }
  }
}
```

This is what actually enforces "one submission per account" on the
server: each take is stored using the lowercased username as its
document ID, and the rule above blocks any write that would overwrite
an existing document. The app's own client-side check (in
`firebase.js` → `hasUserSubmitted`) is just there to give the visitor
instant feedback before they try to type — it isn't what's stopping
duplicates.

### 4. Run it locally

This page uses ES module imports, which most browsers block when a
file is opened directly from disk (`file://`). Serve it over a local
server instead. From inside the project folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

(Any static server works — `npx serve`, VS Code's "Live Server"
extension, etc. The Python command above just needs no installation
beyond Python itself.)

### 5. Deploy to GitHub + Vercel

Push the whole project folder to a GitHub repo, including
`firebase-config.js` (see the note above — it's safe to commit). Your
repo should contain:

```
index.html
style.css
script.js
firebase.js
firebase-config.js
firebase-config.example.js
README.md
```

Then in Vercel:

1. **New Project** → import the GitHub repo.
2. Framework preset: choose **"Other"** (this is a plain static site,
   no build step needed).
3. Leave the build command empty and output directory as the repo
   root.
4. Deploy.

That's it — no environment variables needed, since the Firebase config
is just a regular file in the project.

## Notes on the "one per account" rule

This is enforced two ways, and you need both for it to be solid:

- **Firestore rule** (server-side, real enforcement): blocks a second
  write to the same username's document, no matter what the client
  sends.
- **Client check** in `script.js` (UX only): looks up the username
  before letting someone type, so they see "you already posted" right
  away instead of after typing a whole take and hitting submit.

True IP-based limiting isn't possible from a static front-end page —
IP addresses are only visible server-side. If you need that later,
you'd add a small backend (e.g. a Firebase Cloud Function) that reads
the request IP and checks/stores it alongside the username.
