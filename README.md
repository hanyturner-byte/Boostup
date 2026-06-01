BoostUp - Social Media Growth App
Earn coins by completing TikTok/Instagram tasks. Grow your followers and likes.
Quick Start
Upload all files to GitHub
Connect to Netlify
Add environment variables
Done! Your app is live 🚀
Files Included
src/App.jsx — Main app code
package.json — Dependencies
.env.example — Environment variables template
public/manifest.json — PWA manifest
public/index.html — HTML template
STEP_BY_STEP_GUIDE.md — Detailed setup instructions
DEPLOYMENT_GUIDE.md — All deployment options
SECURITY.md — Security best practices
Setup Instructions
See STEP_BY_STEP_GUIDE.md for exact steps.
Environment Variables
See .env.example for all required variables.
You need to add these 7 variables in Netlify (Site settings → Build & deploy → Environment):
REACT_APP_FIREBASE_API_KEY
REACT_APP_FIREBASE_AUTH_DOMAIN
REACT_APP_FIREBASE_PROJECT_ID
REACT_APP_FIREBASE_STORAGE_BUCKET
REACT_APP_FIREBASE_MESSAGING_SENDER_ID
REACT_APP_FIREBASE_APP_ID
REACT_APP_STRIPE_PUBLISHABLE_KEY
Get the values from your Firebase and Stripe accounts (never commit them to GitHub!)
Features
30-second timer before earning coins
15 tasks per day limit
Real Firebase database
Stripe payments ready
PWA (installable on phones)
Referral system with duplicate prevention
Deploy to Netlify
Create GitHub repo
Upload all files
Go to netlify.com
Click "Add new site" → "Import existing project"
Select your GitHub repo
Add environment variables
Deploy!
Your live URL: https://boostup-[yourname].netlify.app
Support
See STEP_BY_STEP_GUIDE.md for detailed help.
