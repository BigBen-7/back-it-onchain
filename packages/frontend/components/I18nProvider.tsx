"use client";

import { NextIntlClientProvider } from "next-intl";
import React, { useState, useEffect } from "react";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

const messages: Record<string, any> = { en, es };

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState("en");
  const [_isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("app-locale");
    if (saved && (saved === "en" || saved === "es")) {
      setLocale(saved);
    }
    setIsLoaded(true);

    const handleLocaleChange = (e: CustomEvent<{ locale: string }>) => {
      setLocale(e.detail.locale);
    };
    window.addEventListener("localeChange" as any, handleLocaleChange as any);
    return () =>
      window.removeEventListener(
        "localeChange" as any,
        handleLocaleChange as any,
      );
  }, []);

  return (
    <NextIntlClientProvider 
      locale={locale} 
      messages={messages[locale]} 
      timeZone="UTC"
    >
      {children}
    </NextIntlClientProvider>
  );
}

export const switchLocale = (newLocale: string) => {
  localStorage.setItem("app-locale", newLocale);
  const event = new CustomEvent("localeChange", {
    detail: { locale: newLocale },
  });
  window.dispatchEvent(event);
};
