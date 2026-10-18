This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## End-to-end checks

Playwright runs against servers you start yourself: backend on :3000 and `npm run dev` on :3001. Install the browser once with `npx playwright install chromium`.

- `npm run e2e:seed` creates (or tops up) the fixture user and data through the backend API. It is safe to run repeatedly. Credentials are written to `e2e/.auth/credentials.json` (gitignored).
- `npm run e2e` logs in, opens every route and runs axe on desktop and mobile viewports. Findings are reported per route in the output and the HTML report.
- `e2e/password-reset.spec.ts` reads the reset email from disk: start the backend with `MAIL_CAPTURE_DIR=.mail-outbox` (development only). Set `E2E_MAIL_DIR` if that directory is somewhere other than `../../backend/.mail-outbox`.
- `npm run e2e:shots -- /dashboard` writes four PNGs (desktop and mobile, light and dark) to `e2e/.shots/` (gitignored).
