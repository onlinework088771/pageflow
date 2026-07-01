import { PublicLayout } from "@/components/public-layout";
import { Shield, Mail, Database, Eye, Lock, RefreshCw, Globe, Cookie } from "lucide-react";

const EFFECTIVE_DATE = "July 1, 2026";
const CONTACT_EMAIL = "support@aipageflow.site";

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

import { ReactNode } from "react";

export default function Privacy() {
  return (
    <PublicLayout>
      {/* Hero */}
      <div className="mb-12 pb-8 border-b border-border/60">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
          <Shield className="h-3.5 w-3.5" />
          Legal
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-3">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm">Effective date: <strong className="text-foreground">{EFFECTIVE_DATE}</strong></p>
        <p className="mt-4 text-muted-foreground max-w-2xl">
          PageFlow ("we", "our", or "us") operates the AI-powered Facebook page scheduling and automation platform available at <strong className="text-foreground">aipageflow.site</strong>. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our service.
        </p>
      </div>

      <Section title="Information We Collect" icon={Database}>
        <p>We collect the following categories of information:</p>
        <ul className="mt-2 space-y-2">
          <Li><strong className="text-foreground">Account information</strong> — name, email address, and agency name provided during registration.</Li>
          <Li><strong className="text-foreground">Facebook OAuth tokens</strong> — when you connect a Facebook account via Facebook Login, we store the access token and page-level tokens needed to schedule and publish posts on your behalf.</Li>
          <Li><strong className="text-foreground">Page and content data</strong> — Facebook Page IDs, scheduled post content (captions, hashtags, video files), and scheduling times you configure in the platform.</Li>
          <Li><strong className="text-foreground">Usage data</strong> — log data such as IP address, browser type, pages visited within the app, and timestamps of actions, collected automatically for security and analytics.</Li>
          <Li><strong className="text-foreground">Device information</strong> — browser type, operating system, and device identifiers collected via standard web logging.</Li>
        </ul>
        <p className="mt-3">We do <strong className="text-foreground">not</strong> collect payment card numbers directly; billing, if applicable, is handled by third-party processors.</p>
      </Section>

      <Section title="How We Use Facebook Login" icon={Globe}>
        <p>PageFlow uses the <strong className="text-foreground">Facebook Login API</strong> solely to:</p>
        <ul className="mt-2 space-y-2">
          <Li>Authenticate your identity and link your Facebook account to your PageFlow account.</Li>
          <Li>Obtain permission to manage the Facebook Pages you authorize in the OAuth flow.</Li>
          <Li>Read Page metadata (name, ID, category) to populate the scheduling interface.</Li>
          <Li>Publish posts, reels, and videos to the Pages you select, at the times you schedule.</Li>
        </ul>
        <p className="mt-3">
          We request only the minimum permissions required (<code className="bg-muted px-1 py-0.5 rounded text-xs">pages_manage_posts</code>, <code className="bg-muted px-1 py-0.5 rounded text-xs">pages_read_engagement</code>, and related scopes). We do not access your personal Facebook profile content, friends list, messages, or any data beyond what is necessary for scheduling.
        </p>
        <p className="mt-3">
          Facebook access tokens are stored encrypted at rest. You can revoke access at any time from your <strong className="text-foreground">Facebook Settings → Apps and Websites</strong> page, or by deleting your PageFlow account.
        </p>
      </Section>

      <Section title="Cookies and Local Storage" icon={Cookie}>
        <p>We use the following client-side storage mechanisms:</p>
        <ul className="mt-2 space-y-2">
          <Li><strong className="text-foreground">Authentication token</strong> — a JWT stored in <code className="bg-muted px-1 py-0.5 rounded text-xs">localStorage</code> to keep you logged in across sessions. It contains your user ID and role; it does not contain your password.</Li>
          <Li><strong className="text-foreground">Session preferences</strong> — UI state such as selected timezone and draft scheduler settings, stored locally in your browser and never transmitted to our servers.</Li>
          <Li><strong className="text-foreground">No third-party advertising cookies</strong> — we do not serve ads and do not allow ad networks to place cookies on our platform.</Li>
        </ul>
        <p className="mt-3">You can clear all stored data by signing out and clearing your browser's local storage. Doing so will require you to log in again.</p>
      </Section>

      <Section title="How We Use Your Information" icon={Eye}>
        <p>We use the information we collect to:</p>
        <ul className="mt-2 space-y-2">
          <Li>Operate and maintain the PageFlow scheduling platform.</Li>
          <Li>Authenticate users and prevent unauthorized access.</Li>
          <Li>Execute scheduled posts to Facebook Pages on your behalf.</Li>
          <Li>Send transactional notifications (e.g., post failures, account alerts) via email.</Li>
          <Li>Improve and debug the platform by analyzing aggregated, anonymized usage patterns.</Li>
          <Li>Comply with legal obligations and enforce our Terms of Service.</Li>
        </ul>
        <p className="mt-3">We do <strong className="text-foreground">not</strong> sell your personal data to third parties, nor do we use it for targeted advertising.</p>
      </Section>

      <Section title="Data Storage and Security" icon={Lock}>
        <p>
          All data is stored on servers located within the European Union / or a reputable cloud provider's secure infrastructure. We implement industry-standard safeguards including:
        </p>
        <ul className="mt-2 space-y-2">
          <Li>HTTPS/TLS encryption for all data in transit.</Li>
          <Li>Encryption at rest for sensitive fields including OAuth access tokens.</Li>
          <Li>Password hashing using bcrypt with an appropriate work factor.</Li>
          <Li>Role-based access controls limiting employee access to production data.</Li>
          <Li>Regular security reviews and dependency audits.</Li>
        </ul>
        <p className="mt-3">Despite our efforts, no method of transmission over the internet is 100% secure. We cannot guarantee absolute security of your data.</p>
      </Section>

      <Section title="Data Retention" icon={RefreshCw}>
        <p>We retain your data for as long as your account is active or as needed to provide services:</p>
        <ul className="mt-2 space-y-2">
          <Li><strong className="text-foreground">Account data</strong> — retained until you delete your account or request deletion.</Li>
          <Li><strong className="text-foreground">Scheduled post records</strong> — retained for up to 12 months after the post date, then automatically purged.</Li>
          <Li><strong className="text-foreground">Log data</strong> — retained for up to 90 days for security and debugging purposes.</Li>
          <Li><strong className="text-foreground">Facebook tokens</strong> — deleted immediately upon account deletion or Facebook access revocation.</Li>
        </ul>
        <p className="mt-3">You may request earlier deletion of your data at any time. See our <a href="/data-deletion" className="text-primary underline underline-offset-2">Data Deletion page</a> for instructions.</p>
      </Section>

      <Section title="Your Rights" icon={Shield}>
        <p>Depending on your jurisdiction, you may have the following rights regarding your personal data:</p>
        <ul className="mt-2 space-y-2">
          <Li><strong className="text-foreground">Access</strong> — request a copy of the personal data we hold about you.</Li>
          <Li><strong className="text-foreground">Correction</strong> — request correction of inaccurate or incomplete data.</Li>
          <Li><strong className="text-foreground">Deletion</strong> — request deletion of your account and associated data.</Li>
          <Li><strong className="text-foreground">Portability</strong> — request export of your data in a machine-readable format.</Li>
          <Li><strong className="text-foreground">Objection / Restriction</strong> — object to or restrict certain processing of your data.</Li>
          <Li><strong className="text-foreground">Withdraw consent</strong> — withdraw consent for Facebook access at any time without affecting prior processing.</Li>
        </ul>
        <p className="mt-3">To exercise any of these rights, contact us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">{CONTACT_EMAIL}</a>. We will respond within 30 days.</p>
      </Section>

      <Section title="Third-Party Services" icon={Globe}>
        <p>We use the following third-party services that may process your data under their own privacy policies:</p>
        <ul className="mt-2 space-y-2">
          <Li><strong className="text-foreground">Meta (Facebook)</strong> — for the Facebook Login API and Graph API used to publish content.</Li>
          <Li><strong className="text-foreground">Cloud infrastructure provider</strong> — for server hosting and database storage.</Li>
          <Li><strong className="text-foreground">Email delivery provider</strong> — for transactional notifications.</Li>
        </ul>
        <p className="mt-3">We do not share your data with any other third parties except as required by law or to protect our legal rights.</p>
      </Section>

      <Section title="Children's Privacy" icon={Shield}>
        <p>PageFlow is not directed to children under the age of 13 (or 16 in the EU/EEA). We do not knowingly collect personal information from children. If you believe we have inadvertently collected such information, please contact us and we will delete it promptly.</p>
      </Section>

      <Section title="Changes to This Policy" icon={RefreshCw}>
        <p>We may update this Privacy Policy from time to time. When we do, we will revise the "Effective date" at the top of this page. For material changes, we will notify you by email or a prominent in-app notice at least 7 days before the change takes effect. Your continued use of PageFlow after the effective date constitutes acceptance of the updated policy.</p>
      </Section>

      <Section title="Contact Us" icon={Mail}>
        <p>If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:</p>
        <div className="mt-3 p-4 rounded-xl bg-muted/50 border border-border/60 space-y-1 text-sm">
          <p><strong className="text-foreground">PageFlow</strong></p>
          <p>Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">{CONTACT_EMAIL}</a></p>
          <p>Website: <a href="https://aipageflow.site" className="text-primary underline underline-offset-2">aipageflow.site</a></p>
        </div>
      </Section>
    </PublicLayout>
  );
}
