"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { MessageCircle, Send, X, ExternalLink } from "lucide-react";

type Message = { from: "bot" | "user"; text: string; quickReplies?: string[] };

const WHATSAPP_URL = "https://wa.me/2348157377000?text=";

/* ── Knowledge base ── */
const FAQ: { patterns: RegExp[]; answer: string; quickReplies?: string[] }[] = [
  /* ── Pricing ── */
  {
    patterns: [/pric(e|ing|es)/i, /cost/i, /how much/i, /plan/i, /subscription/i, /fee/i, /pay/i, /bill/i, /amount/i],
    answer: "We have 4 plans:\n\n• Basic — ₦7,000/mo (≈$5) — single clinics getting digital\n• Pro — ₦13,000/mo (≈$9) — the full hospital operating system\n• Enterprise — ₦80,000/mo (≈$53) — hospital chains & groups\n• Custom — tailored pricing for government & large institutions\n\nEvery plan includes a free hospital website + patient app. Prices are in NGN; USD shown at current rates.",
    quickReplies: ["What's included in Basic?", "What's included in Pro?", "Is there a free trial?"],
  },
  {
    patterns: [/basic/i, /starter/i, /single clinic/i],
    answer: "The Basic plan (₦7,000/mo) is for single clinics and includes:\n\n• 1 branch, 5 users, 500 patients, 5 GB storage\n• Patient records (EHR)\n• Appointments & scheduling\n• Billing & payments\n• Email support\n\nIt's perfect for small practices getting digital for the first time.",
    quickReplies: ["Upgrade to Pro", "Is there a free trial?"],
  },
  {
    patterns: [/pro\b/i, /professional/i, /full/i, /complete/i, /hospital operating/i],
    answer: "The Pro plan (₦13,000/mo) is our most popular and includes:\n\n• 3 branches, 25 users, 5,000 patients, 50 GB storage\n• Everything in Basic, plus:\n• Pharmacy & drug inventory\n• Laboratory & diagnostics\n• Ward & bed management\n• SMS appointment reminders\n• Reports & analytics\n• Priority support",
    quickReplies: ["Compare all plans", "Is there a free trial?"],
  },
  {
    patterns: [/enterprise/i, /chain/i, /multi.?branch/i, /large/i, /group/i],
    answer: "The Enterprise plan (₦80,000/mo) is for hospital chains & groups:\n\n• Unlimited branches, users, patients, storage\n• Everything in Pro, plus:\n• Multi-branch support\n• NHIA / Insurance / HMO integrations\n• Custom workflows\n• Dedicated account manager\n• On-premise option\n• AI features\n• 24/7 dedicated support",
    quickReplies: ["Talk to sales", "What about Custom plan?"],
  },
  {
    patterns: [/custom/i, /tailored/i, /government/i, /institution/i, /bespoke/i],
    answer: "The Custom plan is for government agencies and large institutions:\n\n• Fully customized to your needs\n• On-premise / private cloud deployment\n• National-scale deployments\n• Training & migration included\n• Full customization\n\nContact our sales team for a tailored proposal.",
    quickReplies: ["Contact sales", "See other plans"],
  },
  /* ── Trial ── */
  {
    patterns: [/free trial/i, /trial/i, /try/i, /test/i, /demo/i, /free/i, /no.*card/i, /credit card/i],
    answer: "Yes! Every plan comes with a 14-day free trial — no credit card required.\n\nYou can set up your hospital in minutes, add patients, staff, and start using all features. If you like it, subscribe; if not, just walk away.\n\nWant to start your trial now?",
    quickReplies: ["Start free trial", "See pricing"],
  },
  /* ── Features & Modules ── */
  {
    patterns: [/feature/i, /module/i, /what.*include/i, /what.*offer/i, /what.*do/i, /capabilit/i, /function/i, /tool/i],
    answer: "SkyCare includes 24+ modules across 8 categories:\n\n🏥 Clinical: EHR, Appointments, Patients, Pharmacy, Lab, Wards\n💰 Financial: Billing, Banking, Expenses, Other Income\n👥 HR & Staff: Staff Management, Leave, HR, Payroll\n💬 Communication: Internal Mail, Chats\n📊 Reports: Medical Reports, Financial Reports\n⚙️ Administration: Audit Logs, Account, Subscription, Settings\n📱 Patient Portal: Download App, Profile\n🏢 Enterprise: Multi-branch, NHIA/Insurance/HMO, AI Features, Custom Workflows, and more",
    quickReplies: ["Tell me about Pharmacy", "Tell me about Billing", "Tell me about Lab"],
  },
  {
    patterns: [/ehr/i, /electronic health/i, /health record/i, /patient record/i, /record/i],
    answer: "SkyCare's EHR (Electronic Health Records) module provides:\n\n• Lifetime patient records — from registration to discharge to follow-up\n• Visit history & pre-appointment notes\n• Unique patient ID with NHIA & insurance data\n• Multi-branch hospital support\n• All patient data on one screen\n\nAvailable on all plans.",
    quickReplies: ["How much does it cost?", "What about appointments?"],
  },
  {
    patterns: [/appoint/i, /schedul/i, /booking/i, /calendar/i],
    answer: "The Appointments module includes:\n\n• Smart scheduling with automated SMS & email reminders\n• Reschedule links built in\n• Doctor availability calendar\n• Reduce no-shows with automated reminders\n• Patient self-booking via the patient app\n\nAvailable on all plans.",
    quickReplies: ["How much does it cost?", "What about reminders?"],
  },
  {
    patterns: [/pharmac/i, /drug/i, /medication/i, /dispens/i, /pharmacy/i, /inventory/i, /nafdac/i],
    answer: "The Pharmacy module includes:\n\n• Real-time drug inventory\n• Batch & expiry tracking\n• Reorder alerts\n• NAFDAC compliance reports\n• E-prescribing with drug-interaction warnings\n• PharmacyPro dispensing link\n\nAvailable on Pro plan and above.",
    quickReplies: ["How much does it cost?", "What about lab?"],
  },
  {
    patterns: [/lab(?:oratory)?/i, /diagnostic/i, /test/i, /result/i, /radiology/i],
    answer: "The Laboratory module includes:\n\n• Order labs and radiology from the consultation screen\n• Results post back automatically\n• Abnormal result flagging\n• Lab test catalog manager\n• Walk-in lab orders\n\nAvailable on Pro plan and above.",
    quickReplies: ["How much does it cost?", "What about wards?"],
  },
  {
    patterns: [/ward/i, /bed/i, /admission/i, /discharge/i, /occupancy/i, /inpatient/i, /outpatient/i],
    answer: "The Ward & Bed Management module includes:\n\n• Live bed-occupancy map\n• Admission & transfer workflows\n• Ward-round documentation\n• Discharge summaries\n• Bed availability tracking\n\nAvailable on Pro plan and above.",
    quickReplies: ["How much does it cost?", "What about billing?"],
  },
  {
    patterns: [/bill/i, /invoice/i, /payment/i, /revenue/i, /financ/i, /money/i, /collect/i],
    answer: "The Billing module includes:\n\n• Automated invoicing\n• Multi-payment support (cash, card, transfer, POS)\n• Online payments via Paystack\n• Insurance claim processing\n• Revenue-leakage alerts\n• VAT & discount support\n• Patient portal for bill payment\n\nNo naira slips through! Available on all plans.",
    quickReplies: ["Online payments?", "How much does it cost?"],
  },
  {
    patterns: [/staff/i, /hr\b/i, /human resource/i, /employee/i, /worker/i, /team/i],
    answer: "The Staff & HR module includes:\n\n• Roster & shift planner\n• Attendance tracking\n• Leave management\n• Payroll & payslips\n• Role-based access control\n• Staff credentials management\n• HR dashboard with analytics\n\nBooking respects who is actually on duty. Available on all plans.",
    quickReplies: ["How much does it cost?", "What about payroll?"],
  },
  {
    patterns: [/payroll/i, /salary/i, /payslip/i, /pay\b/i, /wage/i],
    answer: "The Payroll module includes:\n\n• Automated payroll calculation\n• PAYE, pension, NHF, NHIS deductions\n• Payslip generation\n• Payroll runs & approvals\n• Bank ledger posting\n• PAYE & pension schedules\n• Internal deductions support\n\nNaira 2dp precision. Available on Pro and above.",
    quickReplies: ["How much does it cost?", "Tell me about HR"],
  },
  {
    patterns: [/report/i, /analytic/i, /dashboard/i, /insight/i, /chart/i, /statistic/i],
    answer: "SkyCare offers two report modules:\n\n• Medical Reports — clinical reports, patient records\n• Financial Reports — revenue, P&L, income by service, payroll by department\n\nBoth include:\n• Executive dashboards\n• NHIA-ready regulatory reports\n• Department performance\n• Custom report builder\n• CSV export & print\n\nAvailable on Pro and above.",
    quickReplies: ["How much does it cost?", "See all modules"],
  },
  {
    patterns: [/chat/i, /message/i, /communicat/i, /mail/i, /internal/i, /inbox/i],
    answer: "Communication modules include:\n\n• Internal Mail — broadcast to staff & patients, inbox/sent/compose\n• Staff & Patient Chat — real-time messaging with presence indicators\n• Notification center with push notifications\n\nKeep your team connected. Available on all plans.",
    quickReplies: ["How much does it cost?", "See all modules"],
  },
  {
    patterns: [/website/i, /online presence/i, /landing/i, /web\s?site/i, /hospital website/i],
    answer: "Every hospital gets a FREE website + patient app included with their subscription!\n\nFeatures:\n• Auto-generated from your hospital profile\n• Services & departments listing\n• About page with photos\n• Contact information\n• SEO optimized\n• Customizable via the admin portal\n\nNo extra cost — it's included in every plan.",
    quickReplies: ["How much does it cost?", "What about the patient app?"],
  },
  {
    patterns: [/patient app/i, /mobile app/i, /app\b/i, /download/i, /phone/i, /android/i, /ios/i],
    answer: "Every hospital gets a FREE patient app included!\n\nFeatures:\n• Book appointments\n• View lab results\n• Pay bills online\n• Chat with hospital staff\n• View prescriptions\n• Family account management\n• Profile management\n\nAvailable on all plans at no extra cost.",
    quickReplies: ["How much does it cost?", "What about the website?"],
  },
  {
    patterns: [/ai\b/i, /artificial intelligence/i, /machine learn/i, /smart/i, /automat/i],
    answer: "SkyCare's AI features (Enterprise plan) include:\n\n• AI-powered drug recommendations\n• Smart scheduling suggestions\n• Revenue forecasting & fraud alerts\n• Automated report generation\n• Clinical decision support\n\nAvailable on Enterprise and Custom plans.",
    quickReplies: ["Tell me about Enterprise", "See all plans"],
  },
  {
    patterns: [/nhia/i, /insurance/i, /hmo/i, /claim/i],
    answer: "SkyCare supports NHIA, Insurance & HMO integrations:\n\n• Insurance claim processing\n• NHIA-ready regulatory reports\n• Patient insurance data on one screen\n• Automated claim submissions\n• Coverage verification\n\nAvailable on Enterprise and Custom plans.",
    quickReplies: ["Tell me about Enterprise", "How much does it cost?"],
  },
  /* ── How it works ── */
  {
    patterns: [/how.*work/i, /how.*get started/i, /getting started/i, /setup/i, /onboard/i, /start/i, /begin/i, /step/i, /process/i],
    answer: "Getting started is easy — 3 simple steps:\n\n1️⃣ Sign up in 2 minutes — Create your hospital workspace, add your branch, invite your first staff member. No credit card required.\n\n2️⃣ Add patients & staff — Register patients with NHIA/insurance details, set up doctors' calendars, configure departments.\n\n3️⃣ Go live the same day — Start booking appointments, billing, and dispensing. Your hospital website and patient app are generated automatically.\n\nReady to start?",
    quickReplies: ["Start free trial", "See pricing"],
  },
  /* ── Security ── */
  {
    patterns: [/secur/i, /safe/i, /protect/i, /privacy/i, /encrypt/i, /compli/i, /gdpr/i, /data.*nigeria/i],
    answer: "SkyCare takes security seriously:\n\n• Bank-grade security\n• Data stays in Nigeria\n• Role-based access control\n• Encrypted data at rest and in transit\n• Audit logs for all actions\n• Multi-tenant isolation\n• Regular security audits\n\nYour hospital data is safe with us.",
    quickReplies: ["How much does it cost?", "Tell me about features"],
  },
  /* ── Support ── */
  {
    patterns: [/support/i, /help/i, /assist/i, /contact/i, /reach/i, /email/i, /phone/i, /whatsapp/i, /talk to/i, /speak/i, /human/i, /agent/i, /represent/i],
    answer: "We're here to help!\n\n📧 Email: sales@skycare.app\n📞 Phone: +234 815 737 7000\n📞 Phone: +234 705 811 9864\n🌐 Website: skycare.app\n💬 WhatsApp: Click the button below\n\nSupport levels:\n• Basic — Email support\n• Pro — Priority support\n• Enterprise — 24/7 dedicated support + account manager",
    quickReplies: ["Contact sales", "See pricing"],
  },
  /* ── Company ── */
  {
    patterns: [/who.*are/i, /about.*you/i, /about.*sky/i, /skyhouse/i, /company/i, /who.*built/i, /maker/i, /developer/i],
    answer: "SkyCare is built by Skyhouse Technologies — a Nigerian tech company.\n\n📍 2/4 Moses Adeyemi Street, Ojodu-Ikeja, Lagos, Nigeria\n📞 +234 815 737 7000\n📧 sales@skycare.app\n\nWe've digitized 120+ hospitals and process ₦2.4B+ in billing yearly. Built in Nigeria, for Nigeria and Africa.",
    quickReplies: ["See pricing", "Start free trial"],
  },
  {
    patterns: [/location/i, /address/i, /where.*located/i, /office/i, /lagos/i, /nigeria/i],
    answer: "Our office is in Lagos, Nigeria:\n\n📍 2/4 Moses Adeyemi Street, Ojodu-Ikeja, Lagos, Nigeria\n📞 +234 815 737 7000\n📞 +234 705 811 9864\n📧 sales@skycare.app\n🌐 skycare.app",
    quickReplies: ["Contact sales", "See pricing"],
  },
  /* ── Competitors / Why SkyCare ── */
  {
    patterns: [/why.*sky/i, /better/i, /differ/i, /competitor/i, /alternative/i, /vs\b/i, /compared/i, /unique/i, /advantage/i],
    answer: "Why SkyCare?\n\n🏥 Built for Africa — NHIA, insurance, NAFDAC compliance, Naira billing\n📱 Free website + patient app included — no extra cost\n⚡ 5-minute setup — go live the same day\n💰 Nigerian budgets — from ₦7,000/mo\n🔒 Data stays in Nigeria — bank-grade security\n🤖 AI-powered features — smart scheduling, revenue forecasting\n📊 120+ hospitals digitized — ₦2.4B+ billed yearly\n\nNo other hospital OS gives you all this at this price.",
    quickReplies: ["See pricing", "Start free trial"],
  },
];

/* ── Default / fallback response ── */
const FALLBACK: Message = {
  from: "bot",
  text: "I'm not sure about that one. Let me connect you with our sales team on WhatsApp — they can help with any question!\n\nYou can also reach us at:\n📧 sales@skycare.app\n📞 +234 815 737 7000",
  quickReplies: ["See pricing", "How it works", "Talk to sales"],
};

/* ── Quick action suggestions after each bot reply ── */
const DEFAULT_QUICK_REPLIES = [
  "See pricing",
  "How it works",
  "What features do you have?",
  "Talk to sales",
];

function matchFAQ(input: string): { answer: string; quickReplies?: string[] } | null {
  const text = input.toLowerCase().trim();
  for (const entry of FAQ) {
    if (entry.patterns.some((p) => p.test(text))) {
      return { answer: entry.answer, quickReplies: entry.quickReplies };
    }
  }
  return null;
}

function getQuickReplyAction(reply: string): { type: "link" | "whatsapp"; url?: string; message?: string } {
  const lower = reply.toLowerCase();
  if (lower.includes("start free trial") || lower.includes("start your trial")) {
    return { type: "link", url: "/signup" };
  }
  if (lower.includes("contact sales") || lower.includes("talk to sales") || lower.includes("talk to a human")) {
    return { type: "whatsapp", message: "Hi, I'd like to speak with someone from SkyCare about your hospital management system." };
  }
  if (lower.includes("see pricing") || lower.includes("compare all plans")) {
    return { type: "link", url: "/#pricing" };
  }
  if (lower.includes("how it works") || lower.includes("how does it work")) {
    return { type: "link", url: "/#how-it-works" };
  }
  if (lower.includes("what features") || lower.includes("see all modules")) {
    return { type: "link", url: "/#modules" };
  }
  return { type: "whatsapp", message: reply };
}

export function LiveChat() {
  const [open, setOpen] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const hasWelcomed = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setLaunched(true), 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (open && !hasWelcomed.current) {
      hasWelcomed.current = true;
      setMessages([
        { from: "bot", text: "Welcome to SkyCare! I'm the virtual assistant. 👋", quickReplies: ["See pricing", "How it works", "What features do you have?"] },
        { from: "bot", text: "I can help with pricing, features, how to get started, or connect you with our team. What would you like to know?" },
      ]);
    }
  }, [open]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  function handleQuickReply(reply: string) {
    const action = getQuickReplyAction(reply);
    if (action.type === "link" && action.url) {
      window.location.href = action.url;
      setOpen(false);
      return;
    }
    sendUserMessage(reply);
  }

  function sendUserMessage(text: string) {
    if (!text.trim()) return;
    setMessages((m) => [...m, { from: "user", text }]);
    setInput("");

    const match = matchFAQ(text);
    setTimeout(() => {
      if (match) {
        setMessages((m) => [
          ...m,
          { from: "bot", text: match.answer, quickReplies: match.quickReplies || DEFAULT_QUICK_REPLIES },
        ]);
      } else {
        const waText = encodeURIComponent(text);
        setMessages((m) => [
          ...m,
          { ...FALLBACK, quickReplies: FALLBACK.quickReplies },
        ]);
        setTimeout(() => {
          window.open(WHATSAPP_URL + waText, "_blank", "noopener,noreferrer");
        }, 1200);
      }
    }, 600 + Math.random() * 600);
  }

  const suggestionChips = useMemo(() => {
    if (messages.length === 0) return [];
    const last = messages[messages.length - 1];
    if (last.from === "bot" && last.quickReplies) return last.quickReplies;
    return DEFAULT_QUICK_REPLIES;
  }, [messages]);

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col items-end gap-3">
      {launched && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="animate-chat-pop flex max-w-[240px] cursor-pointer items-center gap-2 rounded-2xl rounded-br-sm bg-white px-4 py-3 text-left text-sm text-slate-700 shadow-xl ring-1 ring-slate-200 transition-transform hover:-translate-y-0.5"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <MessageCircle size={16} />
          </span>
          <span>
            <span className="block font-semibold">Hi there!</span>
            <span className="block text-xs text-slate-500">Need help? Chat with us.</span>
          </span>
        </button>
      )}

      {open && (
        <div className="animate-chat-pop flex h-[520px] w-[370px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
          {/* header */}
          <div className="sky-gradient flex items-center gap-3 px-4 py-3.5 text-white">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30">
              <MessageCircle size={18} />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold">SkyCare Assistant</p>
              <p className="text-xs text-sky-100">Online · instant replies</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/90 transition hover:bg-white/15"
            >
              <X size={18} />
            </button>
          </div>

          {/* messages */}
          <div ref={bodyRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                <span
                  className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.from === "user"
                      ? "sky-gradient rounded-br-sm text-white"
                      : "rounded-bl-sm bg-white text-slate-700 shadow-sm ring-1 ring-slate-100"
                  }`}
                >
                  {m.text}
                </span>
              </div>
            ))}
          </div>

          {/* quick reply chips */}
          {suggestionChips.length > 0 && (
            <div className="flex gap-2 overflow-x-auto border-t border-slate-100 bg-white px-3 py-2.5">
              {suggestionChips.map((reply) => (
                <button
                  key={reply}
                  type="button"
                  onClick={() => handleQuickReply(reply)}
                  className="shrink-0 cursor-pointer rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                >
                  {reply}
                </button>
              ))}
            </div>
          )}

          {/* input */}
          <form
            className="flex items-center gap-2 border-t border-slate-100 bg-white px-3 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              sendUserMessage(input);
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about pricing, features, trials…"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
            <button
              type="submit"
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl sky-gradient text-white shadow-md transition hover:opacity-90"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      {/* launcher */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close live chat" : "Open live chat"}
        className="animate-ring-pulse flex h-14 w-14 cursor-pointer items-center justify-center rounded-full sky-gradient text-white shadow-xl transition-transform hover:scale-105"
      >
        {open ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
}
