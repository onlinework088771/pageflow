import { ReactNode } from "react";
import { PublicLayout } from "@/components/public-layout";
import { Trash2, Mail, Clock, CheckCircle, AlertTriangle, Database } from "lucide-react";

const EFFECTIVE_DATE = "July 1, 2026";
const CONTACT_EMAIL = "support@aipageflow.site";
const RESPONSE_DAYS = 30;

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: ReactNode }) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
      </div>
      <div className="pl-11 space-y-3 text-muted-foreground leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function Li({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0 mt-0.5">
        {number}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-foreground mb-1">{title}</p>
        <p className="text-muted-foreground text-sm leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

export default function DataDeletion() {
  return (
    <PublicLayout>
      {/* Hero */}
      <div className="mb-12 pb-8 border-b border-border/60">
        <div className="inline-flex items-center gap-2 bg-destructive/10 text-destructive text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
          <Trash2 className="h-3.5 w-3.5" />
          Data Rights
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-3">Data Deletion Request</h1>
        <p className="text-muted-foreground text-sm">Last updated: <strong className="text-foreground">{EFFECTIVE_DATE}</strong></p>
        <p className="mt-4 text-muted-foreground max-w-2xl">
          PageFlow is committed to your right to privacy and data control. This page explains what data we store about you, how to request deletion of your account and all associated data, and what happens when we process your request.
        </p>
      </div>

      {/* Quick action card */}
      <div className="mb-10 p-6 rounded-2xl border-2 border-primary/30 bg-primary/5">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/15 shrink-0">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-foreground text-lg mb-1">Request Deletion by Email</p>
            <p className="text-muted-foreground text-sm mb-3">
              Send a deletion request to us and we will permanently delete your account and all associated data within <strong className="text-foreground">{RESPONSE_DAYS} days</strong>.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Data%20Deletion%20Request&body=Hello%2C%0A%0AI%20would%20like%20to%20request%20permanent%20deletion%20of%20my%20PageFlow%20account%20and%20all%20associated%20data.%0A%0AAccount%20email%3A%20%5Byour-email%5D%0A%0AThank%20you.`}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-primary/90 transition-colors"
            >
              <Mail className="h-4 w-4" />
              Email Deletion Request
            </a>
            <p className="mt-2 text-xs text-muted-foreground">
              Send to: <strong className="text-foreground">{CONTACT_EMAIL}</strong> — Subject: "Data Deletion Request"
            </p>
          </div>
        </div>
      </div>

      <Section title="Data We Hold About You" icon={Database}>
        <p>When you use PageFlow, we store the following categories of data tied to your account:</p>
        <ul className="mt-2 space-y-2">
          <Li><strong className="text-foreground">Account profile</strong> — your name, email address, hashed password, and agency name.</Li>
          <Li><strong className="text-foreground">Facebook connections</strong> — your Facebook User ID, connected Page IDs, and encrypted OAuth access tokens used to publish on your behalf.</Li>
          <Li><strong className="text-foreground">Scheduled content</strong> — all posts, videos, captions, hashtags, and scheduling metadata you created in PageFlow.</Li>
          <Li><strong className="text-foreground">Post history</strong> — records of published, failed, and pending scheduled posts associated with your Pages.</Li>
          <Li><strong className="text-foreground">System logs</strong> — server-side request logs tied to your account (IP address, timestamps, API actions) for up to 90 days.</Li>
          <Li><strong className="text-foreground">Settings and preferences</strong> — scheduler preferences, developer settings, and any configuration you saved in the app.</Li>
        </ul>
      </Section>

      <Section title="How to Request Deletion" icon={CheckCircle}>
        <p>You have two options to delete your data:</p>

        <div className="mt-4 mb-6">
          <p className="font-semibold text-foreground mb-3">Option 1 — Self-service (if available in your account):</p>
          <div className="space-y-3">
            <Step number={1} title="Sign in to PageFlow">
              Log in to your account at <a href="https://aipageflow.site/login" className="text-primary underline underline-offset-2">aipageflow.site/login</a>.
            </Step>
            <Step number={2} title="Go to Settings">
              Navigate to <strong>Settings</strong> from the main navigation menu.
            </Step>
            <Step number={3} title="Delete Account">
              Scroll to the "Danger Zone" section and click <strong>Delete Account</strong>. You will be asked to confirm by typing your email address.
            </Step>
            <Step number={4} title="Deletion begins">
              Your account is immediately deactivated and all data is queued for permanent deletion within 30 days.
            </Step>
          </div>
        </div>

        <div>
          <p className="font-semibold text-foreground mb-3">Option 2 — Email request:</p>
          <div className="space-y-3">
            <Step number={1} title="Send an email to our support team">
              Email <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">{CONTACT_EMAIL}</a> with the subject line <strong>"Data Deletion Request"</strong>.
            </Step>
            <Step number={2} title="Include your account details">
              Provide the email address associated with your PageFlow account so we can identify your data.
            </Step>
            <Step number={3} title="Receive confirmation">
              We will send a confirmation email within 5 business days acknowledging your request.
            </Step>
            <Step number={4} title="Data deleted">
              All your data will be permanently deleted within <strong>{RESPONSE_DAYS} calendar days</strong> of the confirmed request. We will send a final confirmation once deletion is complete.
            </Step>
          </div>
        </div>
      </Section>

      <Section title="What Happens When We Delete Your Data" icon={Trash2}>
        <p>Upon processing a deletion request, we will permanently and irreversibly:</p>
        <ul className="mt-2 space-y-2">
          <Li>Delete your account record, including name, email, and hashed password.</Li>
          <Li>Revoke and delete all Facebook OAuth access tokens stored on our servers.</Li>
          <Li>Delete all scheduled posts, published post records, and associated content (captions, video metadata, page associations).</Li>
          <Li>Delete all developer settings, scheduling preferences, and configuration data.</Li>
          <Li>Remove your account from all active sessions (you will be signed out on all devices).</Li>
          <Li>Remove your data from our databases and backups within the 30-day window.</Li>
        </ul>
        <p className="mt-3">
          <strong className="text-foreground">Note:</strong> Deleting your data from PageFlow does not delete any posts already published to your Facebook Pages — those remain on Facebook and must be removed directly through Facebook if desired.
        </p>
      </Section>

      <Section title="What We Cannot Delete" icon={AlertTriangle}>
        <p>In limited circumstances, we may be required to retain certain data:</p>
        <ul className="mt-2 space-y-2">
          <Li><strong className="text-foreground">Legal obligations</strong> — if we are required by law, regulation, or court order to retain records, we will retain only what is legally required and for no longer than mandated.</Li>
          <Li><strong className="text-foreground">Fraud prevention</strong> — if your account was involved in a security incident or suspected fraud, we may retain minimal records needed to investigate or prevent recurrence.</Li>
          <Li><strong className="text-foreground">Aggregate anonymized analytics</strong> — data that has been irreversibly de-identified and cannot be linked back to you is not subject to deletion requests.</Li>
        </ul>
        <p className="mt-3">We will inform you if any such exception applies to your request and explain the basis for retention.</p>
      </Section>

      <Section title="Facebook-Required Callback" icon={CheckCircle}>
        <p>
          As a Facebook-integrated app, PageFlow provides this page as the required <strong className="text-foreground">Data Deletion Status URL</strong> per Meta's platform policies. When Facebook sends us a data deletion request on your behalf (e.g., after you remove PageFlow from your Facebook Apps), we process it identically to a direct user request:
        </p>
        <ul className="mt-2 space-y-2">
          <Li>We receive a signed deletion notification from Facebook's servers.</Li>
          <Li>We verify the signature and identify your account by the associated Facebook User ID.</Li>
          <Li>We delete all data linked to that Facebook account within {RESPONSE_DAYS} days.</Li>
          <Li>You can verify completion by contacting us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">{CONTACT_EMAIL}</a>.</Li>
        </ul>
      </Section>

      <Section title="Response Timeline" icon={Clock}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          {[
            { label: "Acknowledgement", value: "5 business days", desc: "We confirm receipt of your request." },
            { label: "Verification", value: "7 business days", desc: "We verify your identity and locate your data." },
            { label: "Full Deletion", value: "30 calendar days", desc: "All data is permanently purged." },
          ].map((item) => (
            <div key={item.label} className="p-4 rounded-xl bg-muted/40 border border-border/60 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{item.label}</p>
              <p className="text-lg font-bold text-primary mb-1">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Contact Us" icon={Mail}>
        <p>For any questions about data deletion, your rights, or the status of a deletion request, please reach out:</p>
        <div className="mt-3 p-4 rounded-xl bg-muted/50 border border-border/60 space-y-1 text-sm">
          <p><strong className="text-foreground">PageFlow — Data Privacy</strong></p>
          <p>Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">{CONTACT_EMAIL}</a></p>
          <p>Website: <a href="https://aipageflow.site" className="text-primary underline underline-offset-2">aipageflow.site</a></p>
          <p className="text-muted-foreground text-xs mt-2">Response time: within 5 business days.</p>
        </div>
        <p className="mt-4 text-sm">
          You also have the right to lodge a complaint with your local data protection authority if you believe your rights are not being upheld.
        </p>
        <p className="mt-3 text-sm">
          See also: <a href="/privacy" className="text-primary underline underline-offset-2">Privacy Policy</a> · <a href="/terms" className="text-primary underline underline-offset-2">Terms of Service</a>
        </p>
      </Section>
    </PublicLayout>
  );
}
