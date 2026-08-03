"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Send, X } from "lucide-react";

const QUICK_ACTIONS = [
  { label: "Start a free trial", value: "I'd like to start a free trial for my hospital." },
  { label: "See pricing", value: "Please send me the current pricing plans." },
  { label: "Book a demo", value: "I'd like to book a live demo for my team." },
  { label: "Talk to a human", value: "I'd like to speak with someone from Skyhouse Technologies." },
];

type Message = { from: "bot" | "user"; text: string };

const WELCOME: Message[] = [
  { from: "bot", text: "Welcome to SkyCare! I'm the SkyCare assistant." },
  { from: "bot", text: "How can we help you today? We usually reply within minutes." },
];

export function LiveChat() {
  const [open, setOpen] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [messages, setMessages] = useState<Message[]>(WELCOME);
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setLaunched(true);
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  function send(text: string) {
    if (!text.trim()) return;
    setMessages((m) => [...m, { from: "user", text }]);
    setInput("");
    const wa = `https://wa.me/2348157377000?text=${encodeURIComponent(text)}`;
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          from: "bot",
          text: "Thanks! A member of our team will get back to you shortly. You can also continue the chat on WhatsApp for a faster reply.",
        },
      ]);
    }, 900);
    setTimeout(() => {
      window.open(wa, "_blank", "noopener,noreferrer");
    }, 1400);
  }

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
        <div className="animate-chat-pop flex h-[480px] w-[350px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
          {/* header */}
          <div className="sky-gradient flex items-center gap-3 px-4 py-3.5 text-white">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30">
              <MessageCircle size={18} />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold">SkyCare Support</p>
              <p className="text-xs text-sky-100">Online · replies in minutes</p>
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
              <div
                key={i}
                className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}
              >
                <span
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
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

          {/* quick actions */}
          <div className="flex gap-2 overflow-x-auto border-t border-slate-100 bg-white px-3 py-2.5">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => send(a.value)}
                className="shrink-0 cursor-pointer rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
              >
                {a.label}
              </button>
            ))}
          </div>

          {/* input */}
          <form
            className="flex items-center gap-2 border-t border-slate-100 bg-white px-3 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message…"
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
