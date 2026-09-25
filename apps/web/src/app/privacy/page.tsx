"use client";

import { EYEBROW_CLASS } from "@meditaur/ui";
import Link from "next/link";

/**
 * The privacy notice, in plain language.
 *
 * `"use client"` is not needed for anything here — the page has no state — but
 * `packages/ui` ships no directive and its `index.ts` re-exports components that
 * call hooks, so importing the eyebrow token from a server component fails the
 * build. Every other page that uses that package is a client component for the
 * same reason; a page that re-spelled the class instead would be the drift the
 * package exists to prevent.
 *
 * Deliberately small: this is a private beta whose accounts collect an email
 * address, a settings row, and — while the reader is signed in — the material
 * itself, so a second device can open it. The page says exactly that rather than
 * borrowing the shape of a corporate policy — a notice a reader can finish is
 * worth more than one they scroll past.
 *
 * Two things must stay true for this page to be honest, and both are checkable:
 * nothing here is sold or used for advertising, and there is no third-party
 * analytics. `next/font` self-hosts at build time, so loading a page makes no
 * request to a font CDN either. When the analytics item's first-party events land, this
 * page has to say so — see ROADMAP.md.
 */
const LAYOUT = "mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-16";
const HEADING = "text-2xl font-semibold";
const BODY = "text-lg text-muted";

export default function PrivacyPage() {
  return (
    <main className={LAYOUT}>
      <p className={EYEBROW_CLASS}>Privacy</p>
      <h1 className="text-3xl font-semibold">What Meditaur stores about you</h1>

      <section className="flex flex-col gap-3">
        <h2 className={HEADING}>Where your material lives</h2>
        <p className={BODY}>
          Your meditations, symbols, intentions, plans, uploaded sounds and your
          session history live in this browser on this device, and nothing reads
          them from anywhere else. <strong className="text-text">Signed in</strong>,
          they are also kept with your account, so a device you sign in on can pick
          them up; signed out, nothing of yours is uploaded. Either way{" "}
          <strong className="text-text">Download catalog</strong> is worth having,
          because clearing this site&rsquo;s data erases the copy in this browser.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={HEADING}>What an account stores</h2>
        <p className={BODY}>
          An email address, so you can sign in, and your{" "}
          <strong className="text-text">Settings</strong> — volumes, text size and
          the other switches — so a device you sign in on can pick them up. While
          you are signed in, your material is kept with the account as well, which
          is what lets it open on another device. Nothing else is stored, and
          nothing is shared.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={HEADING}>What we don&rsquo;t do</h2>
        <p className={BODY}>
          We don&rsquo;t sell your data or share it for advertising. There is no
          third-party analytics, no tracking pixel and no advertising network.
          Loading a page makes no request to anyone but us.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={HEADING}>Removing it</h2>
        <p className={BODY}>
          Everything on this device is yours to delete without asking anyone:{" "}
          <strong className="text-text">Erase this device&rsquo;s data</strong> on
          the Account screen does it, and so does clearing this site&rsquo;s data
          in your browser settings. Either way it takes your meditations,
          symbols, intentions, plans, uploads and history, and none of it exists
          anywhere else. Neither touches your account. To remove the account
          itself — the address it signs in with, and the settings that follow you
          between devices — use <strong className="text-text">Close my account</strong>{" "}
          on the Account screen: it deletes the account and erases this device,
          and it cannot be undone.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={HEADING}>One more thing</h2>
        <p className={BODY}>
          Meditaur is a wellness tool for timing meditation, not a medical
          device. It does not diagnose, treat or advise.
        </p>
      </section>

      <div className="flex flex-col gap-3 border-t border-line pt-6">
        <Link href="/signup" className="inline-flex min-h-14 items-center text-lg underline">
          Back to creating an account
        </Link>
        <Link href="/" className="inline-flex min-h-14 items-center text-lg underline">
          Back to the start
        </Link>
      </div>
    </main>
  );
}
