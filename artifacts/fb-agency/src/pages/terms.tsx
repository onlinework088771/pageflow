import { ReactNode } from "react";
import { PublicLayout } from "@/components/public-layout";
import { FileText, AlertTriangle, CheckCircle, Users, Scale, Mail, RefreshCw, Shield } from "lucide-react";

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

export default function Terms() {
  return (
    <PublicLayout>
      {/* Hero */}
      <div className="mb-12 pb-8 border-b border-border/60">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
          <FileText className="h-3.5 w-3.5" />
          Legal
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-3">Terms of Service</h1>
        <p className="text-muted-foreground text-sm">Effective date: <strong className="text-foreground">{EFFECTIVE_DATE}</strong></p>
        <p className="mt-4 text-muted-foreground max-w-2xl">
          These Terms of Service ("Terms") govern your access to and use of PageFlow ("Service"), operated by PageFlow ("we", "our", or "us"). By creating an account or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.
        </p>
      </div>

      <Section title="Eligibility and Account Registration" icon={Users}>
        <p>To use PageFlow, you must:</p>
        <ul className="mt-2 space-y-2">
          <Li>Be at least 18 years of age (or the age of legal majority in your jurisdiction).</Li>
          <Li>Have a valid Facebook account and own or have administrative access to the Facebook Pages you connect.</Li>
          <Li>Provide accurate, complete, and current account information during registration.</Li>
          <Li>Maintain the confidentiality of your account credentials and be responsible for all activity under your account.</Li>
        </ul>
        <p className="mt-3">You may not create an account on behalf of another person without their express authorization, or use the Service to manage Pages you do not have legal authority over.</p>
      </Section>

      <Section title="Acceptable Use" icon={CheckCircle}>
        <p>You agree to use PageFlow only for lawful purposes and in accordance with these Terms. You may use the Service to:</p>
        <ul className="mt-2 space-y-2">
          <Li>Schedule and publish legitimate content to Facebook Pages you control.</Li>
          <Li>Manage multiple Facebook Pages and accounts for yourself or clients as part of an agency workflow.</Li>
          <Li>Analyze post performance and scheduling activity within the dashboard.</Li>
        </ul>

        <p className="mt-4 font-semibold text-foreground">You must NOT use the Service to:</p>
        <ul className="mt-2 space-y-2">
          <Li>Post content that violates Facebook's Terms of Service, Community Standards, or Advertising Policies.</Li>
          <Li>Distribute spam, unsolicited messages, or artificially inflate engagement metrics.</Li>
          <Li>Publish content that is defamatory, obscene, harassing, threatening, or that infringes the intellectual property rights of any third party.</Li>
          <Li>Attempt to reverse engineer, decompile, or extract the source code of PageFlow.</Li>
          <Li>Use automated scripts, bots, or other tools to access the platform beyond its intended API.</Li>
          <Li>Circumvent security measures, access controls, or rate limits.</Li>
          <Li>Upload malware, viruses, or any code designed to damage or disrupt systems.</Li>
          <Li>Resell or sublicense access to the Service without our written consent.</Li>
        </ul>

        <p className="mt-3">We reserve the right to suspend or terminate accounts that violate these rules without prior notice.</p>
      </Section>

      <Section title="Facebook Platform Compliance" icon={Shield}>
        <p>PageFlow operates as a third-party integration with the Meta (Facebook) platform. By using the Service, you also agree to comply with:</p>
        <ul className="mt-2 space-y-2">
          <Li><a href="https://www.facebook.com/legal/terms" className="text-primary underline underline-offset-2" target="_blank" rel="noopener noreferrer">Facebook Terms of Service</a></Li>
          <Li><a href="https://developers.facebook.com/terms/" className="text-primary underline underline-offset-2" target="_blank" rel="noopener noreferrer">Meta Platform Terms</a></Li>
          <Li><a href="https://www.facebook.com/communitystandards" className="text-primary underline underline-offset-2" target="_blank" rel="noopener noreferrer">Facebook Community Standards</a></Li>
        </ul>
        <p className="mt-3">You are solely responsible for ensuring that any content you schedule through PageFlow complies with Facebook's policies. PageFlow is not responsible for content removed, restricted, or penalized by Facebook.</p>
      </Section>

      <Section title="User Responsibilities" icon={Users}>
        <p>As a user of PageFlow, you are responsible for:</p>
        <ul className="mt-2 space-y-2">
          <Li>All content scheduled and published through your account.</Li>
          <Li>Maintaining valid and active Facebook permissions. If Facebook revokes access, previously scheduled posts may fail.</Li>
          <Li>Ensuring your uploaded video and image files comply with Facebook's content and format specifications.</Li>
          <Li>Keeping your login credentials secure and logging out of shared devices.</Li>
          <Li>Notifying us immediately at <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">{CONTACT_EMAIL}</a> if you suspect unauthorized access to your account.</Li>
        </ul>
      </Section>

      <Section title="Service Availability and Modifications" icon={RefreshCw}>
        <p>We strive to maintain high availability of the PageFlow platform but do not guarantee uninterrupted access. We may:</p>
        <ul className="mt-2 space-y-2">
          <Li>Perform scheduled maintenance that temporarily suspends access, with advance notice where possible.</Li>
          <Li>Modify, suspend, or discontinue any feature of the Service at any time, with or without notice.</Li>
          <Li>Update these Terms, our pricing (if applicable), or other policies with reasonable notice.</Li>
        </ul>
        <p className="mt-3">Post failures caused by Facebook API outages, rate limits, or policy changes are beyond our control and we are not liable for missed scheduled posts in such circumstances.</p>
      </Section>

      <Section title="Intellectual Property" icon={Shield}>
        <p>
          <strong className="text-foreground">Our platform:</strong> All software, design, trademarks, and content comprising PageFlow are owned by or licensed to us. You may not copy, modify, distribute, or create derivative works from our platform without express written permission.
        </p>
        <p className="mt-3">
          <strong className="text-foreground">Your content:</strong> You retain all ownership rights to the content you upload and schedule through PageFlow. By using the Service, you grant us a limited, non-exclusive license to process and transmit your content solely to deliver the scheduling functionality you request.
        </p>
      </Section>

      <Section title="Limitation of Liability" icon={Scale}>
        <p>To the fullest extent permitted by applicable law:</p>
        <ul className="mt-2 space-y-2">
          <Li>PageFlow is provided on an <strong className="text-foreground">"as is" and "as available"</strong> basis without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, or non-infringement.</Li>
          <Li>We do not warrant that the Service will be error-free, uninterrupted, or free of harmful components.</Li>
          <Li>In no event shall PageFlow, its officers, directors, employees, or agents be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the Service, even if advised of the possibility of such damages.</Li>
          <Li>Our total aggregate liability to you for any claim arising from or relating to the Service shall not exceed the greater of (a) the amount you paid us in the 12 months preceding the claim, or (b) USD $100.</Li>
        </ul>
        <p className="mt-3">Some jurisdictions do not allow the exclusion of certain warranties or limitations of liability, so the above may not fully apply to you.</p>
      </Section>

      <Section title="Indemnification" icon={Shield}>
        <p>You agree to indemnify, defend, and hold harmless PageFlow and its affiliates, officers, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or in any way connected with:</p>
        <ul className="mt-2 space-y-2">
          <Li>Your use of the Service.</Li>
          <Li>Your violation of these Terms.</Li>
          <Li>Your violation of any third-party right, including intellectual property rights or Facebook's platform policies.</Li>
          <Li>Any content you publish or schedule through PageFlow.</Li>
        </ul>
      </Section>

      <Section title="Termination" icon={AlertTriangle}>
        <p>Either party may terminate the relationship under these Terms:</p>
        <ul className="mt-2 space-y-2">
          <Li><strong className="text-foreground">By you:</strong> You may delete your account at any time from the Settings page or by contacting us. Deletion removes your data subject to our retention policy.</Li>
          <Li><strong className="text-foreground">By us:</strong> We may suspend or terminate your account immediately, without prior notice, if you violate these Terms, engage in fraudulent activity, or if required by law.</Li>
        </ul>
        <p className="mt-3">Upon termination, your right to use the Service ceases immediately. Provisions that by their nature should survive termination (intellectual property, indemnification, limitation of liability) shall continue to apply.</p>
      </Section>

      <Section title="Governing Law and Dispute Resolution" icon={Scale}>
        <p>These Terms shall be governed by and construed in accordance with applicable law. Any disputes arising from these Terms or the Service shall first be attempted to be resolved through good-faith negotiation. If unresolved within 30 days, disputes shall be submitted to binding arbitration or the courts of competent jurisdiction.</p>
        <p className="mt-3">If any provision of these Terms is found to be unenforceable, the remaining provisions will remain in full force and effect.</p>
      </Section>

      <Section title="Changes to These Terms" icon={RefreshCw}>
        <p>We may revise these Terms from time to time. We will notify you of material changes by email or prominent in-app notice at least 7 days before the new Terms take effect. The updated Terms will display the revised "Effective date." Your continued use of the Service after the effective date constitutes your acceptance of the new Terms.</p>
      </Section>

      <Section title="Contact Information" icon={Mail}>
        <p>For questions about these Terms of Service, please contact us:</p>
        <div className="mt-3 p-4 rounded-xl bg-muted/50 border border-border/60 space-y-1 text-sm">
          <p><strong className="text-foreground">PageFlow</strong></p>
          <p>Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">{CONTACT_EMAIL}</a></p>
          <p>Website: <a href="https://aipageflow.site" className="text-primary underline underline-offset-2">aipageflow.site</a></p>
        </div>
      </Section>
    </PublicLayout>
  );
}
