"use client";

import { useState, useEffect, type ReactNode } from "react";
import ContactUsForm from "@/components/landing/contact-us-form";

export default function ContactUsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function checkHash() {
      if (window.location.hash === "#contact-us") {
        setOpen(true);
      }
    }
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, []);

  function handleClose() {
    setOpen(false);
    if (window.location.hash === "#contact-us") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  return (
    <>
      {children}
      <ContactUsForm open={open} onClose={handleClose} />
    </>
  );
}
