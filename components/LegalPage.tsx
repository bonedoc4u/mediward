import React from 'react';
import { ArrowLeft, ShieldCheck, FileText } from 'lucide-react';

interface Props {
  type: 'privacy' | 'terms';
  onBack: () => void;
}

const LegalPage: React.FC<Props> = ({ type, onBack }) => {
  const isPrivacy = type === 'privacy';

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl w-full bg-white rounded-2xl shadow border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-8 sm:p-10 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-600/20 to-purple-600/20 mix-blend-overlay" />
          <button 
            onClick={onBack}
            className="absolute top-4 sm:top-6 left-4 sm:left-6 flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium hidden sm:inline">Back</span>
          </button>
          
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border border-white/20">
            {isPrivacy ? (
              <ShieldCheck className="w-8 h-8 text-blue-400" />
            ) : (
              <FileText className="w-8 h-8 text-blue-400" />
            )}
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
            {isPrivacy ? 'Privacy Policy' : 'Terms of Service'}
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Last updated: {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-8 sm:p-10 prose prose-sm sm:prose-base prose-slate max-w-none prose-h2:text-slate-800 prose-h2:mt-8 prose-h2:mb-4 prose-p:text-slate-600 prose-p:leading-relaxed prose-li:text-slate-600">
          {isPrivacy ? (
            <>
              <h2>1. Introduction</h2>
              <p>
                MediWard ("we", "our", or "us") is committed to protecting the privacy and security of users ("you") and patient data. This Privacy Policy explains how we collect, use, process, and protect your information when you use the MediWard application and services, in compliance with the Digital Personal Data Protection (DPDP) Act, 2023 of India and other applicable healthcare regulations.
              </p>

              <h2>2. Data We Collect</h2>
              <p>We collect and process the following categories of data:</p>
              <ul>
                <li><strong>Identity Data:</strong> Name, contact details, authentication credentials role, and hospital affiliation.</li>
                <li><strong>Clinical Data (PHI):</strong> Patient demographics, vital signs, lab results, diagnoses, clinical notes, imaging metadata, and treatment plans entered by healthcare professionals.</li>
                <li><strong>Technical Data:</strong> IP addresses, browser types, device information, and usage logs required for security auditing and diagnostic purposes.</li>
              </ul>

              <h2>3. How We Use the Data</h2>
              <p>We process data exclusively for the following purposes:</p>
              <ul>
                <li>To provide, maintain, and improve the MediWard platform for authorized clinical use.</li>
                <li>To securely store and transmit patient health records as directed by the healthcare institution (the Data Fiduciary).</li>
                <li>To generate FHIR-compliant export bundles compatible with the Ayushman Bharat Digital Mission (ABDM).</li>
                <li>To comply with legal and regulatory obligations.</li>
              </ul>
              <p>We <strong>do not</strong> sell your data, use Patient Health Information (PHI) for marketing, or train external generalized AI models on PHI.</p>

              <h2>4. Cloud Security and Storage</h2>
              <p>
                Your data is securely stored on enterprise-grade cloud infrastructure (Supabase AWS/GCP regions in Mumbai, India). Data is encrypted at rest using AES-256 and in transit using TLS 1.2+. Access to the data is strictly governed by Row-Level Security (RLS) policies, ensuring users can only access data belonging to their authorized hospital workspace.
              </p>

              <h2>5. Generative AI Disclaimer</h2>
              <p>
                Certain features of MediWard may utilize third-party AI models (e.g., Google Gemini) to generate clinical insights or summarize text. Any PHI sent to these APIs is stripped of direct identifiers where possible. By using the AI assistant, you acknowledge that AI-generated insights are for reference only and must be independently verified by a qualified medical professional before clinical application.
              </p>

              <h2>6. User Rights (DPDP Compliance)</h2>
              <p>Under the DPDP Act, patients and authorized users have the right to:</p>
              <ul>
                <li>Access a summary of personal data processed by us.</li>
                <li>Request correction of inaccurate or incomplete data.</li>
                <li>Withdraw consent for data processing.</li>
                <li>Request data erasure (Right to be Forgotten), subject to medical record retention laws.</li>
              </ul>
              <p>Such requests must be routed through your healthcare institution (the Data Fiduciary), which controls the data in the MediWard platform.</p>

              <h2>7. Changes to this Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy within the application. Continued use of the platform after changes constitutes acceptance of the revised policy.
              </p>

              <h2>8. Contact Us</h2>
              <p>
                For any privacy-related queries or grievances, please contact our Grievance Officer at privacy@mediward.com or contact your hospital's IT administration.
              </p>
            </>
          ) : (
            <>
              <h2>1. Acceptance of Terms</h2>
              <p>
                By accessing or using MediWard (the "Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not access or use the Service. These terms apply to all users, including healthcare professionals, administrators, and hospital staff.
              </p>

              <h2>2. Description of Service</h2>
              <p>
                MediWard is a digital ward management platform designed to assist healthcare teams in documenting, tracking, and coordinating in-patient care. The Service includes clinical dashboards, vital sign tracking, laboratory result visualization, discharge summary generation, and secure communication tools.
              </p>

              <h2>3. Clinical Responsibility and Disclaimer</h2>
              <p>
                <strong>MediWard is NOT a medical device.</strong> The Service is an administrative and documentation tool intended to support, not replace, the clinical judgment of qualified healthcare professionals.
              </p>
              <ul>
                <li>You acknowledge that all clinical decisions, diagnoses, and treatments remain the sole responsibility of the attending physician or healthcare provider.</li>
                <li>Information provided by the Service, including automated early warning scores (e.g., NEWS2) or AI-generated insights, must be independently verified.</li>
                <li>We expressly disclaim any liability for adverse patient outcomes resulting from the use or misuse of the Service.</li>
              </ul>

              <h2>4. User Accounts and Security</h2>
              <p>
                You are responsible for maintaining the confidentiality of your account credentials. You agree to notify your hospital administrator immediately of any unauthorized use of your account. You may not share your login credentials with colleagues; all actions performed under your account are logged and attributed to you for audit purposes.
              </p>

              <h2>5. Data Ownership and Licensing</h2>
              <p>
                The hospital or healthcare institution (the "Customer") retains all rights, title, and interest in and to the patient data and institutional data entered into the Service. By using the Service, the Customer grants us a limited, worldwide, non-exclusive license to host, copy, process, and display the data solely as necessary to provide the Service.
              </p>

              <h2>6. Acceptable Use</h2>
              <p>You agree not to:</p>
              <ul>
                <li>Use the Service to store or transmit malicious code, viruses, or illegal content.</li>
                <li>Attempt to gain unauthorized access to data belonging to other hospitals or workspaces.</li>
                <li>Reverse engineer, decompile, or disassemble the Service.</li>
                <li>Use the Service in any manner that violates applicable healthcare data protection laws (e.g., DPDP Act, HIPAA).</li>
              </ul>

              <h2>7. Service Availability and Modifications</h2>
              <p>
                While we strive for 99.9% uptime, we do not guarantee that the Service will be uninterrupted or error-free. We reserve the right to modify, suspend, or discontinue any part of the Service at any time, with reasonable notice to institutional administrators when possible.
              </p>

              <h2>8. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by law, MediWard and its developers shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or goodwill, arising from your use of the Service.
              </p>

              <h2>9. Governing Law</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising from these Terms shall be subject to the exclusive jurisdiction of the courts in India.
              </p>
            </>
          )}
        </div>
        
        {/* Footer */}
        <div className="bg-slate-50 px-6 py-6 sm:px-10 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} MediWard. All rights reserved.
          </p>
          <button 
            onClick={onBack}
            className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors"
          >
            Return to application
          </button>
        </div>
      </div>
    </div>
  );
};

export default LegalPage;
